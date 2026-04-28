import type { MetaPart, TextPart } from "@zaly/ai"

import { defineTool } from "@zaly/ai"
import { Type } from "typebox"

const DEFAULT_MAX_BODY_BYTES = 256 * 1024 // 256 KB — generous for APIs, caps runaway HTML pages

/**
 * Fetch a URL and return the response — JSON when the server speaks JSON,
 * raw text otherwise. Optional `jsonpath` filters the parsed JSON to a
 * subset, which keeps tokens down on chatty APIs.
 *
 * Scope: API endpoints. For HTML pages (browsing, content extraction),
 * the optional `@zaly/browser` package provides browser-backed tools that
 * return a structured a11y tree — much better than raw HTML through this
 * tool. Pointing this at an HTML URL works but the response is a string
 * blob the model has to slog through.
 *
 * Permissions: routes through the `fetch` scope when the agent wires up
 * tool-side permission checks. Until then, callers should restrict via
 * a wrapping permission layer (rule-based or explicit allowlist).
 */
export const fetchTool = defineTool({
  async call(args): Promise<(MetaPart | TextPart)[]> {
    const t0 = Date.now()
    const url = new URL(args.url)
    if (args.query) {
      for (const [k, v] of Object.entries(args.query)) url.searchParams.set(k, v)
    }

    const res = await fetch(url, {
      body: args.body,
      headers: args.headers,
      method: args.method ?? "GET",
    })

    const contentType = res.headers.get("content-type") ?? ""
    const text = await res.text()
    const isJson = contentType.includes("json") || looksLikeJson(text)

    let body: unknown = text
    if (isJson) {
      try {
        body = JSON.parse(text)
      } catch {
        // Server lied about content-type; keep as text.
      }
    }

    if (args.jsonpath !== undefined && body !== text) {
      // Lazy-import — `jsonpath-plus` is only paid for when actually used,
      // and it bundles to a few hundred KB which we'd rather not load on
      // every fetch that doesn't filter.
      const { JSONPath } = await import("jsonpath-plus")
      // oxlint-disable-next-line new-cap -- jsonpath-plus exports as TitleCase
      body = JSONPath({ json: body as object, path: args.jsonpath })
    }

    // Stringify the body for display. JSON pretty-prints; raw text is
    // used as-is.
    const bodyText = typeof body === "string" ? body : JSON.stringify(body, undefined, 2)

    // Cap the body before it reaches the model. Total bytes received is
    // surfaced via the meta so the model can decide whether to refetch
    // with `jsonpath` or use a different tool (browser for HTML, etc.).
    const totalBytes = Buffer.byteLength(bodyText, "utf8")
    const truncated = totalBytes > DEFAULT_MAX_BODY_BYTES
    const displayed = truncated ? bodyText.slice(0, DEFAULT_MAX_BODY_BYTES) : bodyText

    const meta: Record<string, unknown> = {
      contentType: contentType || undefined,
      durationMs: Date.now() - t0,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    }
    if (truncated) {
      meta.truncated = {
        bytes: totalBytes,
        hint:
          args.jsonpath === undefined
            ? "body exceeded limit; pass `jsonpath` to filter, or use the browser tool for HTML."
            : "filtered body still exceeded limit; tighten the JSONPath expression.",
        limit: DEFAULT_MAX_BODY_BYTES,
      }
    }

    const parts: (MetaPart | TextPart)[] = [{ data: meta, tag: "fetch", type: "meta" }]
    if (displayed !== "") parts.push({ format: isJson ? "json" : undefined, text: displayed, type: "text" })
    return parts
  },
  desc:
    "Fetch a URL and return the response. JSON responses are parsed; " +
    "use `jsonpath` (e.g. `$.items[*].name`) to extract a subset and " +
    "minimise tokens. Best for APIs — for web pages, use the browser tool.",
  name: "fetch",

  // oxlint-disable-next-line sort-keys -- semantic param order: url, method, headers, query, body, jsonpath
  params: Type.Object({
    url: Type.String({ description: "Absolute URL." }),
    method: Type.Optional(
      Type.Union(
        [
          Type.Literal("GET"),
          Type.Literal("POST"),
          Type.Literal("PUT"),
          Type.Literal("PATCH"),
          Type.Literal("DELETE"),
        ],
        { default: "GET", description: "HTTP method. Defaults to GET." }
      )
    ),
    headers: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description: "Request headers.",
      })
    ),
    query: Type.Optional(
      Type.Record(Type.String(), Type.String(), {
        description: "Query string params, appended to the URL.",
      })
    ),
    body: Type.Optional(
      Type.String({
        description:
          "Request body as a string. For JSON, stringify it yourself and " +
          "set `headers: { 'Content-Type': 'application/json' }`.",
      })
    ),
    jsonpath: Type.Optional(
      Type.String({
        description:
          "JSONPath expression applied to a JSON response, e.g. " +
          "`$.items[*].name`. Returns the matched values as an array.",
      })
    ),
  }),
})

/** Cheap JSON sniff for servers that send `text/plain` for JSON bodies
 *  (more common than it should be). Trims and checks the first
 *  non-whitespace char. */
function looksLikeJson(text: string): boolean {
  const trimmed = text.trimStart()
  return trimmed.startsWith("{") || trimmed.startsWith("[")
}
