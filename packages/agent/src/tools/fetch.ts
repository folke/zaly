import type { Attachment, MetaPart, TextPart, Tool } from "@zaly/ai"
import type { ToolInit } from "./registry.ts"

import { defineTool, toAttachment } from "@zaly/ai"
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
export function createFetchTool(init: ToolInit): Tool {
  const attachmentKinds: string[] = []
  if (init.model.canAttach("image")) attachmentKinds.push("image")
  if (init.model.canAttach("pdf")) attachmentKinds.push("PDF")
  const attachmentBlurb =
    attachmentKinds.length > 0
      ? ` ${attachmentKinds.join(" and ")} responses are delivered as attachments.`
      : ""

  return defineTool({
    async call(args): Promise<(Attachment | MetaPart | TextPart)[]> {
      const t0 = Date.now()
      const url = new URL(args.url)
      if (args.query) {
        for (const [k, v] of Object.entries(args.query)) url.searchParams.set(k, v)
      }

      const res = await fetch(url, {
        body: args.body,
        headers: args.headers,
        method: args.method,
      })

      const contentType = res.headers.get("content-type") ?? ""
      const bytes = new Uint8Array(await res.arrayBuffer())

      const meta: Record<string, unknown> = {
        contentType: contentType || undefined,
        durationMs: Date.now() - t0,
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
      }

      // Magic-byte detection on the response bytes — catches mislabeled
      // content (HTML served at /file.pdf, images served as
      // application/octet-stream, etc.). Inlines as base64 (same shape as
      // the `read` tool) so the model gets the bytes without the provider
      // re-fetching from its own IP. Only attach kinds the model accepts;
      // unsupported kinds fall through to the text branch (rendered via
      // `<image>` / `<pdf>` placeholders by the wire pipeline).
      const { fileDetect } = await import("@zaly/shared/detect")
      const file = await fileDetect({
        data: bytes,
        mime: contentType || undefined,
        url: url.toString(),
      })
      if (
        file &&
        ((file.type === "image" && init.model.canAttach("image")) ||
          (file.type === "pdf" && init.model.canAttach("pdf")))
      ) {
        const att = await toAttachment(file)
        if (att) return [{ data: meta, tag: "fetch", type: "meta" }, att]
      }

      const text = new TextDecoder().decode(bytes)
      // `detectTextFormat` (inside fileDetect) already weighs MIME,
      // extension, and content sniff — reuse its verdict instead of a
      // parallel `looksLikeJson` heuristic.
      const isJson = file?.type === "text" && file.format === "json"

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
      if (displayed !== "")
        parts.push({ format: isJson ? "json" : undefined, text: displayed, type: "text" })
      return parts
    },
    desc: `Fetch a URL and return the response. JSON responses are parsed; use \`jsonpath\` (e.g. \`$.items[*].name\`) to extract a subset and minimise tokens.${attachmentBlurb} Best for APIs — for web pages, use the browser tool.`,
    name: "fetch",
    parallel: true,

    // oxlint-disable-next-line sort-keys -- semantic param order: url, method, headers, query, body, jsonpath
    params: Type.Object({
      url: Type.String({ description: "Absolute URL." }),
      method: Type.Union(
        [
          Type.Literal("GET"),
          Type.Literal("POST"),
          Type.Literal("PUT"),
          Type.Literal("PATCH"),
          Type.Literal("DELETE"),
        ],
        { default: "GET", description: "HTTP method." }
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
}
