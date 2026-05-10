import type { FetchLike } from "../../src/types.ts"

import { describe, expect, test, vi } from "vitest"
import { withRetry } from "../../src/utils/retry.ts"

// ── helpers ──────────────────────────────────────────────────────────────

interface QueuedFetch {
  fetch: FetchLike
  readonly calls: number
}

/** Build a fetch stub that returns the given responses in order;
 *  throws when exhausted. Use with zero-delay retries by forcing
 *  `baseMs: 0` on the wrapper. */
function queuedFetch(responses: (Response | Error)[]): QueuedFetch {
  let n = 0
  const fetch: FetchLike = async () => {
    if (n >= responses.length) throw new Error("fetch stub exhausted")
    const next = responses[n++]
    if (next instanceof Error) throw next
    return next
  }
  return {
    get calls() {
      return n
    },
    fetch,
  }
}

describe("withRetry", () => {
  test("first call succeeds — no retry", async () => {
    const stub = queuedFetch([new Response("ok", { status: 200 })])
    const fetch = withRetry(stub.fetch, { baseMs: 0, retries: 3 })
    const res = await fetch("http://x")
    expect(res.status).toBe(200)
    expect(stub.calls).toBe(1)
  })

  test("retries 429 until success", async () => {
    const stub = queuedFetch([
      new Response("rate", { status: 429 }),
      new Response("rate", { status: 429 }),
      new Response("ok", { status: 200 }),
    ])
    const fetch = withRetry(stub.fetch, { baseMs: 0, retries: 3 })
    const res = await fetch("http://x")
    expect(res.status).toBe(200)
    expect(stub.calls).toBe(3)
  })

  test("retries 5xx", async () => {
    const stub = queuedFetch([
      new Response("boom", { status: 503 }),
      new Response("ok", { status: 200 }),
    ])
    const fetch = withRetry(stub.fetch, { baseMs: 0, retries: 3 })
    const res = await fetch("http://x")
    expect(res.status).toBe(200)
    expect(stub.calls).toBe(2)
  })

  test("gives up after max retries and returns last response", async () => {
    const stub = queuedFetch([
      new Response("", { status: 500 }),
      new Response("", { status: 500 }),
      new Response("", { status: 500 }),
    ])
    const fetch = withRetry(stub.fetch, { baseMs: 0, retries: 2 })
    const res = await fetch("http://x")
    expect(res.status).toBe(500)
    expect(stub.calls).toBe(3)
  })

  test("does not retry 4xx other than 429", async () => {
    const stub = queuedFetch([new Response("nope", { status: 401 })])
    const fetch = withRetry(stub.fetch, { baseMs: 0, retries: 3 })
    const res = await fetch("http://x")
    expect(res.status).toBe(401)
    expect(stub.calls).toBe(1)
  })

  test("retries on thrown network errors", async () => {
    const stub = queuedFetch([new Error("ECONNRESET"), new Response("ok", { status: 200 })])
    const fetch = withRetry(stub.fetch, { baseMs: 0, retries: 3 })
    const res = await fetch("http://x")
    expect(res.status).toBe(200)
    expect(stub.calls).toBe(2)
  })

  test("AbortError is not retried", async () => {
    const abortErr = new Error("aborted")
    abortErr.name = "AbortError"
    const stub = queuedFetch([abortErr])
    const fetch = withRetry(stub.fetch, { baseMs: 0, retries: 3 })
    await expect(fetch("http://x")).rejects.toThrow(/aborted/)
    expect(stub.calls).toBe(1)
  })

  test("honours Retry-After (seconds) up to maxMs", async () => {
    const stub = queuedFetch([
      new Response("", { headers: { "retry-after": "1" }, status: 429 }),
      new Response("ok", { status: 200 }),
    ])
    const onRetry = vi.fn()
    const fetch = withRetry(stub.fetch, { baseMs: 0, maxMs: 10, onRetry, retries: 3 })
    const res = await fetch("http://x")
    expect(res.status).toBe(200)
    // 1 second cap would delay the test; maxMs clamps to 10ms.
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0].waitMs).toBe(10)
  })

  test("AbortSignal aborts pending backoff wait", async () => {
    const controller = new AbortController()
    const stub = queuedFetch([new Response("", { status: 500 }), new Response("", { status: 500 })])
    const fetch = withRetry(stub.fetch, { baseMs: 10_000, retries: 3 })
    const p = fetch("http://x", { signal: controller.signal })
    // Give fetch a microtask to queue, then abort during the backoff.
    await Promise.resolve()
    controller.abort()
    await expect(p).rejects.toThrow(/aborted/)
  })

  test("custom shouldRetry can treat 402 as retryable", async () => {
    const stub = queuedFetch([
      new Response("", { status: 402 }),
      new Response("ok", { status: 200 }),
    ])
    const fetch = withRetry(stub.fetch, {
      baseMs: 0,
      retries: 3,
      shouldRetry: ({ response }) => response?.status === 402,
    })
    const res = await fetch("http://x")
    expect(res.status).toBe(200)
    expect(stub.calls).toBe(2)
  })
})
