/**
 * `withRetry` — wrap a `fetch` implementation with pre-stream retry
 * and exponential backoff. Designed specifically for streaming APIs:
 * retries only trigger before the response body is consumed, so an
 * SSE stream that fails mid-flight propagates rather than restarting
 * (which would waste already-generated tokens).
 *
 * Wire it at the provider factory:
 *
 * ```ts
 * import { createOpenAI } from "@zaly/ai"
 * import { withRetry } from "@zaly/ai/utils/retry"
 *
 * createOpenAI({ fetch: withRetry(fetch, { retries: 3 }) })
 * ```
 */
import type { FetchLike } from "../types.ts"

export type { FetchLike } from "../types.ts"

export interface RetryOptions {
  /** Max retry attempts — `0` disables retries. Default `3`. */
  retries?: number
  /** Base backoff in ms. Actual wait is `baseMs * 2^attempt` with
   *  ±50% jitter, capped at `maxMs`. Default `250`. */
  baseMs?: number
  /** Cap for a single backoff wait. Default `10_000`. */
  maxMs?: number
  /** Predicate deciding whether a response or error is retryable.
   *  Default retries on `429`, `5xx` responses, and on throws other
   *  than aborts. Override to customise (e.g. treat a provider-
   *  specific `402` as retryable). */
  shouldRetry?: (result: { response?: Response; error?: unknown }) => boolean
  /** Hook fired before each retry wait — useful for telemetry /
   *  logging. Receives the 0-based attempt number that just failed. */
  onRetry?: (info: {
    attempt: number
    waitMs: number
    response?: Response
    error?: unknown
  }) => void
}

const defaultShouldRetry = ({
  response,
  error,
}: {
  response?: Response
  error?: unknown
}): boolean => {
  if (error !== undefined) {
    // Don't retry user-initiated aborts or programmer errors.
    if (error instanceof Error && error.name === "AbortError") return false
    return true
  }
  if (response === undefined) return false
  if (response.status === 429) return true
  if (response.status >= 500 && response.status < 600) return true
  return false
}

/**
 * Wrap a fetch impl with retry + backoff. Retries only fire before
 * the response body is consumed — mid-stream failures propagate.
 */
export function withRetry(fetchImpl: FetchLike, opts: RetryOptions = {}): FetchLike {
  const retries = opts.retries ?? 3
  const baseMs = opts.baseMs ?? 250
  const maxMs = opts.maxMs ?? 10_000
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry

  return async (input, init) => {
    const signal = init?.signal ?? undefined

    for (let attempt = 0; ; attempt++) {
      let response: Response | undefined
      let thrown: unknown
      try {
        // oxlint-disable-next-line no-await-in-loop
        response = await fetchImpl(input, init)
      } catch (error) {
        thrown = error
      }

      // Success → return response. On the final attempt, also return
      // whatever we have (including a failing response) so the caller
      // can surface the last body / status in their error message.
      if (thrown === undefined && response !== undefined) {
        if (response.ok) return response
      }
      const last = attempt >= retries
      if (last || !shouldRetry({ error: thrown, response })) {
        if (thrown !== undefined) throw thrown
        // response is guaranteed defined here — non-ok responses end
        // up returned for the caller to inspect.
        return response as Response
      }

      // Honour Retry-After for 429/503 if present; otherwise
      // exponential backoff with full jitter.
      const ra = response?.headers.get("retry-after") ?? undefined
      const raMs = ra === undefined ? undefined : retryAfterMs(ra)
      const wait =
        raMs !== undefined
          ? Math.min(maxMs, raMs)
          : Math.min(maxMs, baseMs * 2 ** attempt) * (0.5 + Math.random())

      opts.onRetry?.({ attempt, error: thrown, response, waitMs: wait })

      // oxlint-disable-next-line no-await-in-loop
      await sleep(wait, signal)
    }
  }
}

/** Parse `Retry-After` — either a delay in seconds or an HTTP-date. */
function retryAfterMs(value: string): number | undefined {
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const when = Date.parse(value)
  if (Number.isFinite(when)) return Math.max(0, when - Date.now())
  return undefined
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(abortError())
      return
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      reject(abortError())
    }
    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

function abortError(): Error {
  const e = new Error("aborted")
  e.name = "AbortError"
  return e
}
