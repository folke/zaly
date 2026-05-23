import type { CompressOpts } from "@zaly/shared/image"
import type { Attachment, ContentPart, ImagePart, MetaPart } from "../types.ts"
import type { Inlined } from "./part.ts"
import type { AnyPart, ContentTransform } from "./transform.ts"

import { cleanTextAgent } from "@zaly/shared/text"
import { errorToMetaPart, fileToMetaPart, metaToTextPart } from "./format.ts"
import { inlineFile } from "./part.ts"

/**
 * Step-function helpers for `ContentTransform`. Each helper returns a
 * *step function* — `(ct) => ct.{ops}` — which carries the chain's
 * current `T` through the transformation. Use them with `.pipe(...)`:
 *
 * ```ts
 * const wireReady = ContentTransform.create()
 *   .pipe(errorToMeta())          // ErrorPart → <error> MetaPart
 *   .pipe(metaToText())           // MetaPart  → <tag>JSON</tag> TextPart
 *   .pipe(dropAttachments())      // strip image/pdf/audio/video
 * ```
 *
 * The step-function shape is what makes the chain's narrowing flow
 * across helpers — each step takes `ContentTransform<T>` and returns
 * `ContentTransform<U>`, so TS can infer T at the call site and
 * compute U from the body. (See `pipe` vs `extend` on `ContentTransform`
 * for the design rationale.)
 */

/** Drop every attachment kind (image, pdf, audio, video). Use when
 *  forwarding to a text-only model and you genuinely don't want any
 *  reference to the attachment in the resulting content (logs,
 *  persistence, masked replays). For "model can't take this kind, but
 *  the model should know an attachment was here", prefer
 *  `attachmentToMeta(...)`. */
export function dropAttachments() {
  return <T extends ContentPart>(ct: ContentTransform<T>) =>
    ct.drop("image").drop("pdf").drop("audio").drop("video")
}

/** Replace specified attachment kinds with a per-kind tagged
 *  `MetaPart` (`<image>`, `<pdf>`, `<audio>`, `<video>`) carrying the
 *  part's mime and source-reference (url or path) — but *not* the
 *  bytes. Useful when a provider doesn't support certain modalities
 *  but you don't want to silently drop them.
 *
 *  ```ts
 *  ct.pipe(attachmentToMeta("audio", "video"))
 *  ``` */
export function attachmentToMeta<K extends Attachment["type"]>(...kinds: readonly K[]) {
  return <T extends AnyPart>(ct: ContentTransform<T>) => {
    let result: ContentTransform = ct as ContentTransform
    for (const k of kinds) {
      // The lint rule below misfires on `result.map` (the transform
      // method, not Array.map).
      // oxlint-disable-next-line unicorn/no-array-method-this-argument
      result = result.map(k, fileToMetaPart) as ContentTransform
    }
    return result as ContentTransform<Exclude<T, { type: K }> | MetaPart>
  }
}

/** Replace every `ErrorPart` with a `<error>` `MetaPart`. The resulting
 *  meta serializes to `<error>JSON</error>` via `metaToText` —
 *  models recognize the tag and use it as a clear signal to
 *  course-correct. */
export function errorToMeta() {
  return <T extends ContentPart>(ct: ContentTransform<T>) => ct.map("error", errorToMetaPart)
}

/** Replace every `MetaPart` with its text serialization
 *  (`<tag>JSON</tag>`). Provider adapters call this at the wire
 *  boundary so the model sees flat text + attachments only. */
export function metaToText() {
  return <T extends ContentPart>(ct: ContentTransform<T>) => ct.map("meta", metaToTextPart)
}

/** Run every `TextPart` through `cleanTextAgent` — strip ANSI control
 *  sequences, strip C0/C1 control bytes (NUL → literal `\0`), normalize
 *  line endings + Unicode (NFC), and strip adversarial Unicode (zero-
 *  widths, bidi controls, tag chars).
 *
 *  Place at the *end* of the pipeline (after `metaToText`) so meta
 *  parts that became text are also cleaned. Idempotent on already-clean
 *  input — bash output that pre-ran `cleanTextTui` only pays for the
 *  agent-specific bits (SGR strip + adversarial). */
export function sanitizeText() {
  return <T extends ContentPart>(ct: ContentTransform<T>) =>
    ct.map("text", (part) => ({ ...part, text: cleanTextAgent(part.text) }))
}

/** Truncate every `TextPart` to `maxLen` characters. This is mainly used as a safety valve
 * to prevent runaway token counts from mis-behaving tools */
export function truncateText(maxLen = 60_000) {
  return <T extends ContentPart>(ct: ContentTransform<T>) =>
    ct.map("text", (part) => ({ ...part, text: part.text.slice(0, maxLen) }))
}

/** Compress every base64-source `ImagePart` to fit a size budget.
 *  Resizes to `maxDimension` on the longest edge and re-encodes
 *  (JPEG with quality step-down, or PNG when the source has alpha).
 *  Url-source images pass through — those are delivered by reference
 *  and the size cap is the provider's problem.
 *
 *  Place after `inlineFileSources()` (so file sources have already
 *  become base64) and before `metaToText()`. Default budget is 5 MB,
 *  matching Anthropic's hard cap; OpenAI's 512 MB is a soft "yes you
 *  could" so we cap there too — busy prompts at full resolution waste
 *  tokens and bandwidth. */
export function compressImages(opts: CompressOpts = {}) {
  return <T extends ContentPart>(ct: ContentTransform<T>) => {
    // Cast wider for the .mapAsync call so a chain that already
    // narrowed `image` to `Inlined<ImagePart>` (post-`inlineFileSources`)
    // doesn't lose that narrowing — we only emit base64-source images,
    // so the result is structurally still `Inlined<ImagePart>`.
    const wide = ct as unknown as ContentTransform
    const out = wide.mapAsync("image", compressImagePart(opts))
    return out as unknown as ContentTransform<
      Exclude<T, ImagePart> | (T extends ImagePart ? Inlined<T> : never)
    >
  }
}

function compressImagePart(opts: CompressOpts) {
  return async (img: ImagePart): Promise<ImagePart> => {
    // URL-source images aren't ours to re-encode — provider fetches.
    if (img.source.type !== "base64") return img
    const format = formatFromMime(img.mime)
    if (format === undefined) return img
    const data = Buffer.from(img.source.data, "base64")
    const { imageCompress } = await import("@zaly/shared/image")
    const compressed = await imageCompress({ data, format, type: "image" }, opts)
    return {
      ...img,
      mime: compressed.format === "png" ? "image/png" : "image/jpeg",
      source: {
        data: Buffer.from(compressed.data).toString("base64"),
        type: "base64",
      },
    }
  }
}

function formatFromMime(mime: string): "jpeg" | "png" | "webp" | undefined {
  if (mime === "image/png") return "png"
  if (mime === "image/jpeg") return "jpeg"
  if (mime === "image/webp") return "webp"
  return undefined
}

/** For every attachment whose `source.type === "file"`, read the file
 *  from disk and inline as base64. Falls back to a `<file>` `MetaPart`
 *  when the file can't be read — preserves the path as a breadcrumb
 *  without dropping the part silently.
 *
 *  The chain's output type narrows attachments to exclude file sources. */
export function inlineFileSources() {
  return <T extends ContentPart>(ct: ContentTransform<T>) => {
    // Cast wider for the .mapAsync calls — kinds may not all be in T,
    // but the runtime gracefully no-ops on absent kinds. Output type
    // is asserted explicitly so callers see the narrowed shape.
    const wide = ct as unknown as ContentTransform
    const out = wide
      .mapAsync("image", inlineFile)
      .mapAsync("pdf", inlineFile)
      .mapAsync("audio", inlineFile)
      .mapAsync("video", inlineFile)
    return out as unknown as ContentTransform<
      Exclude<T, Attachment> | (T extends Attachment ? Inlined<T> : never) | MetaPart
    >
  }
}
