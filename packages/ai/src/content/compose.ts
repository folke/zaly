import type { Attachment, ContentPart, MetaPart } from "../types.ts"
import type { Inlined } from "./part.ts"
import type { ContentTransform } from "./transform.ts"

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
  return <T extends ContentPart>(ct: ContentTransform<T>) => {
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

