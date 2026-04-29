import type { RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Image } from "../widgets/image.ts"
import type { MdCallbacks, MdImageMeta } from "./types.ts"

import { basename } from "pathe"
import { stripAnsi } from "../style/ansi.ts"

/** Minimal host shape the image callback needs. Any Node-like parent
 *  with a per-src `Image` cache satisfies it — the `Markdown` widget is
 *  the primary caller but the interface keeps this file decoupled from
 *  widget internals (and breaks the widgets↔markdown import loop). */
export interface ImageHost {
  /** Per-src cache so re-renders reuse the same `Image` — same KGP
   *  placement id, which the spec guarantees is a flicker-free
   *  move/resize. */
  images: Map<string, Image>
  /** Attach a freshly-created `Image` as a child so mount/unmount
   *  propagate. */
  add(child: Node): unknown
}

/** Per-occurrence image metadata collected during markdown rendering. */
interface ImageEntry {
  src: string
  alt: string
}

/**
 * Image callback + post-processor for the markdown pipeline.
 *
 * The markdown renderer is synchronous (callbacks return strings), but
 * image preparation is async (sharp metadata, KGP transmit, format
 * conversion). We reconcile with a two-pass approach:
 *
 *  1. During rendering, the `image` callback pushes `{ src, alt }` into
 *     the entries array and emits a compact `<img id=N>` marker where
 *     `N` is the entry's index. The marker is plain text so any
 *     renderer (marked or `Bun.markdown.render`) emits it verbatim.
 *  2. After rendering, `resolve(ctx, rendered)` renders every unique
 *     src concurrently via cached `Image` nodes, then replaces each
 *     marker with either the rendered rows (for *block* images — ones
 *     that end up on their own line) or the markdown alt text (for
 *     inline images, which would otherwise break text flow).
 *
 * The caller passes in a persistent `cache: Map<src, Image>` owned by
 * the Markdown instance so re-renders reuse the same Image node (and
 * therefore the same KGP placement id, which the spec guarantees is a
 * flicker-free move/resize).
 */
export function createImageCallback(host: ImageHost): {
  cb: MdCallbacks["image"]
  resolve: (ctx: RenderCtx, rendered: string) => Promise<string>
} {
  const entries: ImageEntry[] = []
  const cache = host.images

  return {
    cb(alt: string, meta: MdImageMeta): string {
      const id = entries.length
      entries.push({ alt, src: meta.src })
      return `<img id=${id}>`
    },

    async resolve(ctx: RenderCtx, rendered: string): Promise<string> {
      if (entries.length === 0) return rendered

      // `Image` is heavy (pulls image-meta, sharp lazy loaders, KGP
      // encoder) and 99% of markdown has no images. Load it only when
      // we have something to place.
      const { Image } = await import("../widgets/image.ts")

      // One Image (and therefore one KGP `placementId`) per occurrence
      // so multiple references to the same `src` show up as distinct
      // placements on screen. Cache key is `${src}\0${ordinal-within-src}`
      // — the ordinal makes each repeated reference stable across
      // re-renders (slot 0 is always slot 0, so the placementId stays
      // pinned and KGP gives a flicker-free move/resize). Image bytes
      // are de-duped at a different layer (`transmitOnce` in kitty.ts),
      // so multiple occurrences cost N placements but only one transmit.
      const ordinals = new Map<string, number>()
      const rowsByEntry: string[][] = []
      await Promise.all(
        entries.map(async (entry, idx) => {
          const ord = ordinals.get(entry.src) ?? 0
          ordinals.set(entry.src, ord + 1)
          const key = `${entry.src}\u0000${ord}`
          let img = cache.get(key)
          if (img === undefined) {
            img = new Image({ alt: entry.alt, src: entry.src })
            host.add(img)
            cache.set(key, img)
          }
          rowsByEntry[idx] = await img.render(ctx)
        })
      )

      // Walk the rendered output line by line:
      //   - Marker alone on its line (whitespace + ANSI tolerated) →
      //     replace the line with the full image rows.
      //   - Marker mid-line → inline ref placeholder, then splice the
      //     image rows on the next line(s) so the picture still
      //     appears below the surrounding text.
      // Multiple markers on one mid-line all get inline refs; their
      // image rows stack underneath in document order.
      const out: string[] = []
      for (const line of rendered.split("\n")) {
        const matched: { entry: ImageEntry; rows: string[] }[] = []
        for (const m of line.matchAll(MARKER_RE)) {
          const idx = Number(m[1])
          matched.push({ entry: entries[idx], rows: rowsByEntry[idx] ?? [] })
        }

        if (matched.length === 0) {
          out.push(line)
          continue
        }

        const lineHasOnlyMarker =
          matched.length === 1 && stripAnsi(line.replace(MARKER_RE, "")).trim() === ""

        if (lineHasOnlyMarker && matched[0].rows.length > 0) {
          out.push(...matched[0].rows)
          continue
        }

        // Mid-line: replace each marker with a nice inline ref, then
        // append every image's rows below the line in order. Skip rows
        // that don't contain real graphics (KGP escapes) — when the
        // terminal can't render images, `Image.render` falls back to a
        // single-row alt-text representation, which would just
        // duplicate the inline label we already emitted.
        out.push(
          line.replaceAll(MARKER_RE, (_, idxStr: string) => labelOf(entries[Number(idxStr)]))
        )
        for (const { rows } of matched) {
          if (rows.some(isRealGraphics)) out.push(...rows)
        }
      }
      return out.join("\n")
    },
  }
}

/** Friendly inline placeholder for an image that can't render at this
 *  position. Prefers the markdown alt text; falls back to the basename
 *  of the source path (so `[clip.png]` instead of `[/tmp/long/path/clip.png]`),
 *  and "image" for anything weirder. */
function labelOf(entry: ImageEntry): string {
  const label = entry.alt !== "" ? entry.alt : basename(entry.src) || "image"
  return `[${label}]`
}

const MARKER_RE = /<img id=(\d+)>/g

/** True when a row contains a Kitty Graphics Protocol escape (transmit
 *  or place) — i.e. real image data, not the text alt fallback. */
function isRealGraphics(row: string): boolean {
  return row.includes("\x1b_G")
}
