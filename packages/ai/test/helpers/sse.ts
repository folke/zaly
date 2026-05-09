/**
 * Test helpers for building fake SSE responses + recording fetch
 * invocations, so provider adapters can be exercised without hitting
 * the network.
 */
import type { ProviderRequest, StreamOptions } from "../../src/provider.ts"
import type { Message, Quirks, Tool } from "../../src/types.ts"
import type { FetchLike } from "../../src/utils/retry.ts"

/** Build a `ProviderRequest` from a flat options shape — convenient for
 *  tests that don't care about the `ctx` / `opts` split.
 *
 *  Defaults `caching: false` so request-shape assertions stay focused
 *  on translation rather than cache-marker noise. Caching-specific
 *  tests pass `caching: true` explicitly. */
export function streamReq(
  flat: {
    model: string
    messages: Message[]
    prompt?: string[]
    tools?: Tool[]
    quirks?: Quirks
  } & StreamOptions
): ProviderRequest {
  const { model, messages, prompt, tools, quirks, ...rest } = flat
  const opts: StreamOptions = { caching: false, ...rest }
  return { ctx: { messages, prompt, tools }, model, opts, quirks }
}

/** Build a `ReadableStream<Uint8Array>` carrying the given JSON
 *  chunks in SSE wire format, terminated with `data: [DONE]`. */
export function sseBody(chunks: unknown[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        const data = typeof chunk === "string" ? chunk : JSON.stringify(chunk)
        controller.enqueue(encoder.encode(`data: ${data}\n\n`))
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
}

/** Shorthand: fake `Response` with an SSE body. */
export function sseResponse(chunks: unknown[], init?: ResponseInit): Response {
  return new Response(sseBody(chunks), {
    headers: { "content-type": "text/event-stream" },
    status: 200,
    ...init,
  })
}

export interface RecordedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** Create a fake `fetch` that records every call and returns a
 *  fixed or handler-produced response. `recorded` is populated in
 *  call order so tests can assert on what was sent. */
export function recordFetch(
  respond: Response | ((req: RecordedRequest) => Response | Promise<Response>)
): { fetch: FetchLike; recorded: RecordedRequest[] } {
  const recorded: RecordedRequest[] = []
  const fetch: FetchLike = async (input, init) => {
    const url = toUrl(input)
    const headers: Record<string, string> = {}
    if (init?.headers !== undefined) {
      for (const [k, v] of new Headers(init.headers).entries()) {
        headers[k] = v
      }
    }
    const bodyText = typeof init?.body === "string" ? init.body : undefined
    const body: unknown = bodyText === undefined ? undefined : safeJson(bodyText)
    const req: RecordedRequest = { body, headers, method: init?.method ?? "GET", url }
    recorded.push(req)
    return typeof respond === "function" ? await respond(req) : respond
  }
  return { fetch, recorded }
}

function toUrl(input: string | URL | Request): string {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.href
  return input.url
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}
