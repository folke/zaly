import type {
  Attachment,
  Content,
  ContentPart,
  ErrorPart,
  FilePart,
  MetaPart,
  TextPart,
} from "../types.ts"

import { safeStringify } from "@zaly/shared"
import { ContentTransform } from "./transform.ts"

export type WithoutPart<
  P extends ContentPart,
  T extends Content = Content,
> = T extends readonly ContentPart[] ? Exclude<T[number], P>[] : T // string falls through unchanged

export type WithPart<K extends ContentPart["type"]> = Extract<ContentPart, { type: K }>

const ATT_TYPES = new Set(["image", "pdf", "audio", "video"])
const PART_TYPES = new Set(["text", "meta", "error", ...ATT_TYPES])

export function isContentPart(v: unknown): v is ContentPart {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    typeof (v as { type: unknown }).type === "string" &&
    PART_TYPES.has((v as { type: string }).type)
  )
}

export function isAttachment(p: { type: string }): p is Attachment {
  return isContentPart(p) && ATT_TYPES.has(p.type)
}

/** Returns true if any non-text, non-meta part is present in a content
 *  value — signal to provider adapters that an attachment-fallback emit
 *  may be needed (e.g. OpenAI tool messages can't carry images, so the
 *  adapter splits them into a synthetic user message). */
export function hasAttachments(content: Content): boolean {
  if (typeof content === "string") return false
  return content.some((p) => isAttachment(p))
}

export function toContent(value: unknown): Content {
  if (typeof value === "string") return value
  if (value === undefined) return ""
  if (Array.isArray(value) && value.length > 0 && value.every(isContentPart)) {
    return value
  }
  if (isContentPart(value)) return [value]
  return [{ format: "json", text: safeStringify(value), type: "text" }]
}

export function stringifyContent(content: Content | ContentPart): string {
  if (typeof content === "string") return content
  const parts = isContentPart(content) ? [content] : content
  // Flatten every non-text variant to a TextPart, then join. The
  // pipeline is built from sync primitives only, so `runSync` is safe.
  //   attachment (image/pdf/audio/video) → MetaPart (mime + ref) → TextPart
  //   ErrorPart                           → <error> MetaPart       → TextPart
  //   MetaPart                            → TextPart (`<tag>…</tag>`)
  return getFlatten()
    .runSync(parts)
    .map((p) => p.text)
    .join("\n")
}

let flattenCache: ContentTransform<TextPart> | undefined

/** Lazily-built flatten pipeline used by `stringifyContent`. Built on
 *  first call rather than at module init so the constituent converters
 *  (defined below) are in scope by the time we read them. */
function getFlatten(): ContentTransform<TextPart> {
  if (flattenCache) return flattenCache
  flattenCache = ContentTransform.create()
    .map("image", fileToMetaPart)
    .map("pdf", fileToMetaPart)
    .map("audio", fileToMetaPart)
    .map("video", fileToMetaPart)
    .map("error", errorToMetaPart)
    .map("meta", metaToTextPart)
  return flattenCache
}

// ── Part-to-part converters (used by `stringifyContent` and step helpers in compose.ts) ──

/** Wrap an `ErrorPart` as a `<error>` `MetaPart`. `data` carries the
 *  structured discriminator (`code`, optional `data`, `retryable`) so
 *  the model can branch programmatically; `content` carries the
 *  human-readable formatted block (via `renderErrorPart`). */
export function errorToMetaPart(e: ErrorPart): MetaPart {
  return {
    content: [{ text: renderErrorPart(e), type: "text" }],
    data: {
      code: e.code,
      data: e.data,
      retryable: e.retryable ? true : undefined,
    },
    tag: "error",
    type: "meta",
  }
}

/** Convert an attachment to a per-kind MetaPart carrying just enough
 *  info for the model to reason about it: mime + a source reference
 *  (url or path) when one is available. The kind becomes the *tag*
 *  itself (`<image>`, `<pdf>`, `<audio>`, `<video>`). Base64 bytes are
 *  deliberately omitted (useless as text context, would balloon the
 *  prompt). */
export function fileToMetaPart(p: FilePart): MetaPart {
  const ref = {} as { url?: string; path?: string }
  if (p.source.type === "url") ref.url = p.source.url
  else if (p.source.type === "file") ref.path = p.source.path
  return {
    data: { mime: p.mime, ...ref },
    tag: p.type,
    type: "meta",
  }
}

/** Per-MetaPart serializer to TextPart. Used by the `metaToText` step
 *  and available for inline composition. */
export function metaToTextPart(m: MetaPart): TextPart {
  return { text: renderMetaPart(m), type: "text" }
}

// ── Rendering primitives ─────────────────────────────────────────────────

/** Render an `ErrorPart` as a compact text block. The code is the
 *  stable handle, message follows on the same line (or after a
 *  newline if it's long / multi-line); a `retry: true` marker is
 *  appended for retryable errors. Same shape `errorToMetaPart`
 *  embeds inside its `<error>` content. */
export function renderErrorPart(e: ErrorPart): string {
  const nl = e.message.length > 200 || e.message.includes("\n")
  const lines = [`❌ ${e.code}${nl ? ":\n" : ": "}${e.message}`]
  if (e.retryable) lines.push("retry: true")
  return lines.join("\n")
}

/** Render a `MetaPart` as XML. `data` (if set) is dumped as JSON / used
 *  verbatim for strings; `content` (if set) is stringified recursively
 *  (nested tags). When both are present, `data` renders first as a
 *  structured header and `content` follows as the body — both inside
 *  the wrapping tag, so everything between `<tag>` and `</tag>` belongs
 *  to that meta unit. */
export function renderMetaPart(m: MetaPart): string {
  const dataLine = m.data !== undefined ? stringifyData(m.data) : undefined
  const contentBody = m.content !== undefined ? stringifyContent(m.content) : undefined
  const inner = [dataLine, contentBody].filter((s) => s !== undefined && s !== "").join("\n")
  return toXml(inner, m.tag)
}

function stringifyData(data: unknown): string {
  return typeof data === "string" ? data : safeStringify(data)
}

/** Wrap `data` in an XML tag. `data` is JSON-stringified (strings used
 *  verbatim) — no Content recursion. To wrap nested `Content`, build a
 *  `MetaPart` with the `content` arm and render via `renderMetaPart` /
 *  `stringifyContent`. */
export function toXml(data: unknown, tag?: string, opts: { indent?: boolean } = {}): string {
  const safeTag = sanitizeTag(tag)
  const body = stringifyData(data).trim()
  const lines = body.split("\n")
  if (lines.length === 1) return `<${safeTag}>${body}</${safeTag}>`
  const text = lines.map((l) => ((opts.indent ?? true) ? `  ${l}` : l)).join("\n")
  return `<${safeTag}>\n${text}\n</${safeTag}>`
}

function sanitizeTag(tag: string | undefined): string {
  const cleaned = (tag ?? "meta").replace(/[^A-Za-z0-9-]/g, "")
  return cleaned === "" ? "meta" : cleaned
}

/** Convert any `MetaPart`s in a content array into `TextPart`s
 *  (`<tag>JSON</tag>`-wrapped via `toXml`), leaving other parts
 *  untouched. Provider adapters call this at the wire boundary so the
 *  model sees flat text + attachments. The conditional return type
 *  guarantees the output has no MetaPart members.
 *
 *  Note this is *transformation*, not filtering — every input element
 *  produces an output element (length and order preserved). The name is
 *  deliberately distinct from `Array.flat` to avoid that mental model. */
export function transformMeta<T extends Content>(content: T): WithoutPart<MetaPart, T> {
  if (typeof content === "string") return content as WithoutPart<MetaPart, T>
  return content.map((part) =>
    part.type === "meta" ? { text: renderMetaPart(part), type: "text" } : part
  ) as WithoutPart<MetaPart, T>
}

export function justText(content: Content): string {
  if (typeof content === "string") return content
  return content
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n")
}
