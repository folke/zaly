import type { DetectedFile, DetectedImage } from "@zaly/shared"
import type { Attachment, ErrorPart, ImagePart, MetaPart, PdfPart } from "../types.ts"

import { fileData, imageConvert } from "@zaly/shared"
import { toXml } from "./format.ts"

// ── Part constructors (raw → ContentPart) ────────────────────────────────

/** Wrap a converted image as an `ImagePart` for an agent message. */
export function toImagePart(img: DetectedImage<"jpeg" | "webp" | "png">): ImagePart {
  const mime = ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const)[img.format]
  return {
    mime,
    source: { data: Buffer.from(img.data).toString("base64"), type: "base64" },
    type: "image",
  }
}

/** Wrap PDF bytes as a `PdfPart` for an agent message. */
export function toPdfPart(data: Uint8Array): PdfPart {
  return {
    mime: "application/pdf",
    source: { data: Buffer.from(data).toString("base64"), type: "base64" },
    type: "pdf",
  }
}

/** Lift a `DetectedFile` to the matching `Attachment`. Returns
 *  `undefined` for binary/text — those don't have a wire representation
 *  as an attachment and the caller is expected to render them inline. */
export async function toAttachment(file: DetectedFile): Promise<Attachment | undefined> {
  if (file.type === "binary" || file.type === "text") return undefined
  if (file.type === "pdf") return toPdfPart(file.data)

  // Image
  const ready = await imageConvert(file, ["png", "jpeg", "webp"])
  return ready ? toImagePart(ready) : undefined
}

// ── Part-to-part converters (used by step helpers in compose.ts) ─────────

/** Build the `<error>JSON</error>` MetaPart for one ErrorPart. */
export function toErrorMeta(e: ErrorPart): MetaPart {
  return {
    data: {
      code: e.code,
      message: e.message,
      ...(e.data !== undefined ? { data: e.data } : {}),
      ...(e.retryable !== undefined ? { retryable: e.retryable } : {}),
    },
    tag: "error",
    type: "meta",
  }
}

/** Convert an attachment to a per-kind MetaPart carrying just enough
 *  info for the model to reason about it: mime + a source reference
 *  (url or path) when one is available. The kind becomes the *tag*
 *  itself (`<image>`, `<pdf>`, `<audio>`, `<video>`) — closer to
 *  "here's a file/url you can act on" than "an attachment was here."
 *  Base64 bytes are deliberately omitted (useless as text context,
 *  would balloon the prompt). */
export function toAttachmentMeta(p: Attachment): MetaPart {
  return {
    data: { mime: p.mime, ...sourceRef(p.source) },
    tag: p.type,
    type: "meta",
  }
}

/** Per-MetaPart serializer to TextPart. Used by the `metaToText` step
 *  and available for inline composition. */
export function metaToTextPart(m: MetaPart): { text: string; type: "text" } {
  return { text: toXml(m.data, m.tag), type: "text" }
}

/** Per-attachment file-to-base64 inliner. Pass to `mapAsync(kind, …)`
 *  for each attachment kind you care about. Falls back to a `<file>`
 *  MetaPart on read failure. */
export async function inlineFile<P extends Attachment>(
  part: P
): Promise<Inlined<P> | MetaPart> {
  if (part.source.type !== "file") return part as Inlined<P>
  const file = await fileData({ path: part.source.path })
  if (!file) {
    return {
      data: { error: "unreadable", path: part.source.path },
      tag: "file",
      type: "meta",
    }
  }
  return {
    ...part,
    source: { data: Buffer.from(file.data).toString("base64"), type: "base64" },
  } as Inlined<P>
}

/** Attachment with `source.type === "file"` removed from its source
 *  union — what `inlineFile` produces and what provider adapters can
 *  consume directly. Narrowing only — same runtime shape as the
 *  parent variant. */
export type Inlined<P extends Attachment> = P & {
  source: Exclude<P["source"], { type: "file" }>
}

function sourceRef(s: Attachment["source"]): { url?: string; path?: string } {
  if (s.type === "url") return { url: s.url }
  if (s.type === "file") return { path: s.path }
  return {}
}
