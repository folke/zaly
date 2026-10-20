import type { Attachment, MetaPart, TextPart } from "@zaly/ai"

import { defineTool, toAttachment, zalyUserAgent } from "@zaly/ai"
import { randomHash } from "@zaly/shared"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { Type } from "typebox"
import { truncate } from "../utils/truncate.ts"

/**
 * Fetch APIs or static pages. HTML becomes readable Markdown; raw mode
 * preserves the response text. Conversion never runs page scripts.
 * Truncated text is saved in full alongside the session, like bash output.
 *
 * Permissions: routes through the `fetch` scope when the agent wires up
 * tool-side permission checks. Until then, callers should restrict via
 * a wrapping permission layer (rule-based or explicit allowlist).
 */
// oxlint-disable-next-line sort-keys
export const fetchTool = defineTool({
  desc:
    `Fetch a URL and return the response. JSON responses are parsed; use \`jsonpath\` (e.g. \`$.items[*].name\`) to extract a subset and minimise tokens. ` +
    `HTML pages are converted to readable Markdown without executing JavaScript; use a browser for interactive pages. ` +
    `Images & PDFs are returned as attachments. Truncated text is saved in full; read \`truncated.fullOutputPath\` to inspect it.`,
  name: "fetch",
  parallel: true,

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
        { default: "GET", description: "HTTP method." }
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
    format: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("markdown"), Type.Literal("raw")], {
        default: "auto",
        description:
          "auto converts HTML to Markdown and parses JSON. markdown also treats unrecognized text as HTML. raw returns original text without conversion or JSON parsing. Attachments are unchanged.",
      })
    ),
    limit: Type.Optional(
      Type.Integer({
        default: 2000,
        description:
          "Maximum lines to keep inline, split between head and tail. Full output is saved when truncated.",
        minimum: 1,
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
  async call(args, ctx): Promise<(Attachment | MetaPart | TextPart)[]> {
    if (args.format === "raw" && args.jsonpath !== undefined)
      throw new Error("jsonpath cannot be combined with format: raw")
    const t0 = Date.now()
    const url = new URL(args.url)
    if (args.query) {
      for (const [k, v] of Object.entries(args.query)) url.searchParams.set(k, v)
    }

    const headers = new Headers(args.headers)
    if (!headers.has("user-agent")) headers.set("User-Agent", zalyUserAgent)
    const res = await fetch(url, {
      body: args.body,
      headers,
      method: args.method,
      signal: ctx.signal,
    })

    const contentType = res.headers.get("content-type") ?? ""
    const bytes = new Uint8Array(await res.arrayBuffer())

    const meta: Record<string, unknown> = {
      contentType: contentType || undefined,
      durationMs: Date.now() - t0,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      url: res.url || url.href,
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
      url: res.url || url.href,
    })
    if (file) {
      const att = await toAttachment(file)
      if (att) return [{ data: meta, tag: "fetch", type: "meta" }, att]
    }

    const text = new TextDecoder().decode(bytes)
    // `detectTextFormat` (inside fileDetect) already weighs MIME,
    // extension, and content sniff — reuse its verdict instead of a
    // parallel `looksLikeJson` heuristic.
    const isJson = file?.type === "text" && file.format === "json"

    let body: unknown = text
    let outputFormat: string | undefined
    if (isJson && args.format !== "raw") {
      try {
        body = JSON.parse(text)
        outputFormat = "json"
      } catch {
        // Server lied about content-type; keep as text.
      }
    }
    if (args.format !== "raw" && !isJson && file?.type === "text") {
      if (file.format === "html" || (args.format === "markdown" && file.format !== "markdown")) {
        const { htmlToMarkdown } = await import("../utils/html.ts")
        const page = htmlToMarkdown(text, res.url || url.href)
        body = page.markdown
        outputFormat = "markdown"
        if (page.title) meta.title = page.title
        if (page.warning) meta.warning = page.warning
      } else if (file.format === "markdown") outputFormat = "markdown"
    }

    if (args.jsonpath !== undefined) {
      if (outputFormat !== "json") throw new Error("jsonpath requires a valid JSON response")
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

    const summary = truncate(bodyText, { maxLines: args.limit, strategy: "head+tail" })
    if (summary.truncated) {
      let extension = "txt"
      if (outputFormat === "markdown") extension = "md"
      else if (outputFormat === "json") extension = "json"
      const dir = ctx.sessionDir ?? join(tmpdir(), "zaly-fetch")
      const fullOutputPath = join(dir, `fetch-${randomHash()}.${extension}`)
      await mkdir(dir, { recursive: true })
      await writeFile(fullOutputPath, bodyText, "utf8")
      meta.truncated = {
        fullOutputPath,
        totalBytes: summary.origBytes,
        totalLines: summary.origLines,
      }
    }
    meta.durationMs = Date.now() - t0
    const parts: (MetaPart | TextPart)[] = [{ data: meta, tag: "fetch", type: "meta" }]
    if (summary.text !== "") parts.push({ format: outputFormat, text: summary.text, type: "text" })
    return parts
  },
})
