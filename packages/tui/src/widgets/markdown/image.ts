import type { RenderCtx } from "../../core/ctx.ts"
import type { MdCallbacks, MdImageMeta } from "../../style/md/index.ts"
import type { Image } from "../image.ts"
import type { Markdown } from "./index.ts"

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
export function createImageCallback(
  node: Markdown,
  cache: Map<string, Image>
): {
  image: MdCallbacks["image"]
  resolve: (ctx: RenderCtx, rendered: string) => Promise<string>
} {
  const entries: ImageEntry[] = []

  return {
    image(alt: string, meta: MdImageMeta): string {
      const id = entries.length
      entries.push({ alt, src: meta.src })
      return `<img id=${id}>`
    },

    async resolve(ctx: RenderCtx, rendered: string): Promise<string> {
      if (entries.length === 0) return rendered

      // `Image` is heavy (pulls image-meta, sharp lazy loaders, KGP
      // encoder) and 99% of markdown has no images. Load it only when
      // we have something to place.
      const { Image } = await import("../image.ts")

      // Render each unique src once via the cached Image node.
      const uniqueSrcs = [...new Set(entries.map((e) => e.src))]
      const rowsBySrc = new Map<string, string[]>()
      await Promise.all(
        uniqueSrcs.map(async (src) => {
          const alt = firstAltForSrc(entries, src)
          let img = cache.get(src)
          if (img === undefined) {
            img = new Image({ alt, src })
            node.add(img)
            cache.set(src, img)
          }
          rowsBySrc.set(src, await img.render(ctx))
        })
      )

      return rendered.replaceAll(MARKER_RE, (match, idxStr: string, offset: number) => {
        const entry = entries[Number(idxStr)]
        const rows = rowsBySrc.get(entry.src) ?? []

        // Block detection: a marker on its own line (surrounded by
        // newlines or the string edge) gets the full image rows.
        // Inline markers fall back to alt text so they don't shred the
        // paragraph.
        const atLineStart = offset === 0 || rendered[offset - 1] === "\n"
        const endOffset = offset + match.length
        const atLineEnd = endOffset === rendered.length || rendered[endOffset] === "\n"

        if (atLineStart && atLineEnd && rows.length > 0) {
          return rows.join("\n")
        }
        return entry.alt === "" ? `[${entry.src}]` : `[${entry.alt}]`
      })
    },
  }
}

const MARKER_RE = /<img id=(\d+)>/g

function firstAltForSrc(entries: ImageEntry[], src: string): string {
  for (const e of entries) if (e.src === src) return e.alt
  return ""
}
