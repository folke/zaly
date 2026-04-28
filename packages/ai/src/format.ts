import type { Content, ContentPart, MetaPart } from "./types.ts"

import { safeStringify } from "@zaly/shared"

type WithoutMeta<T extends Content> = T extends readonly ContentPart[]
  ? Exclude<T[number], MetaPart>[]
  : T // string falls through unchanged

const PART_TYPES = new Set(["text", "meta", "image", "pdf", "audio", "video"])

function isContentPart(v: unknown): v is ContentPart {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    typeof (v as { type: unknown }).type === "string" &&
    PART_TYPES.has((v as { type: string }).type)
  )
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

export function stringifyContent(content: Content): string {
  if (typeof content === "string") return content
  return content
    .map((p) => {
      if (p.type === "text") return p.text
      if (p.type === "meta") return toXml(p.data, p.tag)
      return `[${p.type}]`
    })
    .join("\n")
}

export function toXml(data: unknown, tag?: string): string {
  const cleaned = (tag ?? "meta").replace(/[^A-Za-z0-9-]/g, "")
  const safeTag = cleaned === "" ? "meta" : cleaned
  const body = (typeof data === "string" ? data : safeStringify(data)).trim()
  const text = body.includes("\n") ? `\n${body}\n` : body
  return `<${safeTag}>${text}</${safeTag}>`
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
export function transformMeta<T extends Content>(content: T): WithoutMeta<T> {
  if (typeof content === "string") return content as WithoutMeta<T>
  return content.map((part) =>
    part.type === "meta" ? { text: toXml(part.data, part.tag), type: "text" } : part
  ) as WithoutMeta<T>
}

/** Returns true if any non-text, non-meta part is present in a content
 *  value — signal to provider adapters that an attachment-fallback emit
 *  may be needed (e.g. OpenAI tool messages can't carry images, so the
 *  adapter splits them into a synthetic user message). */
export function hasAttachments(content: Content): boolean {
  if (typeof content === "string") return false
  return content.some((p) => p.type !== "text" && p.type !== "meta")
}
