import type { RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { TerminalQueries } from "../input/queries.ts"
import type { Image } from "../widgets/image.ts"
import type { MathExpression } from "./math.ts"
import type { MdCallbacks, MdImageMeta } from "./types.ts"

import { stringWidth, stripAnsi } from "@zaly/shared/ansi"
import { basename } from "pathe"
import { resolveAnsiStyle } from "../style/style.ts"
import { MATH_PIXELS_PER_CELL, replaceMath } from "./math.ts"

/** Minimal host shape the image callback needs. Any Node-like parent
 *  with a per-src `Image` cache satisfies it — the `Markdown` widget is
 *  the primary caller but the interface keeps this file decoupled from
 *  widget internals (and breaks the widgets↔markdown import loop). */
export interface ImageHost {
  /** Per-src cache so re-renders reuse the same `Image` — same KGP
   *  placement id, which the spec guarantees is a flicker-free
   *  move/resize. */
  images: Map<string, Image>
  queries?: TerminalQueries
  /** Attach a freshly-created `Image` as a child so mount/unmount
   *  propagate. */
  add: (child: Node) => unknown
  remove: (child: Node) => unknown
}

/** Per-occurrence image metadata collected during markdown rendering. */
interface ImageEntry {
  src: string
  alt: string
  math?: MathExpression
}

/**
 * Image callback + post-processor for the markdown pipeline.
 *
 * The markdown renderer is synchronous (callbacks return strings), but
 * image preparation is async (sharp metadata, KGP transmit, format
 * conversion). Math shares the same markers and placement path:
 *
 *  1. Before rendering, `prepare` collects math expressions and protects
 *     their markers from ordinary Markdown escaping.
 *  2. During rendering, the `image` callback pushes `{ src, alt }` into
 *     the entries array and emits a compact `<img id=N>` marker where
 *     `N` is the entry's index. The marker is plain text so any
 *     renderer (marked or `Bun.markdown.render`) emits it verbatim.
 *  3. After rendering, `resolve(ctx, rendered)` typesets math to cached
 *     SVG files, renders every unique
 *     src concurrently via cached `Image` nodes, then replaces each
 *     marker with rendered rows. Inline images share a top-aligned row
 *     band, with continuation rows padded to each image's terminal column.
 *
 * The caller passes in a persistent `cache: Map<src, Image>` owned by
 * the Markdown instance so re-renders reuse the same Image node (and
 * therefore the same KGP placement id, which the spec guarantees is a
 * flicker-free move/resize).
 */
export function createImageCallback(host: ImageHost): {
  cb: MdCallbacks["image"]
  prepare: (source: string) => string
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

    prepare(source: string): string {
      return replaceMath(source, (math) => {
        const id = entries.length
        entries.push({ alt: math.source, math, src: "" })
        // A bare tag on its own line starts an HTML block and swallows following Markdown.
        return `\`<img id=${id}>\``
      })
    },

    async resolve(ctx: RenderCtx, rendered: string): Promise<string> {
      if (entries.length === 0) {
        for (const img of cache.values()) host.remove(img)
        cache.clear()
        return rendered
      }

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
      const { loadKittyGraphics } = await import("../image/kitty.ts")
      const graphics =
        entries.some((entry) => entry.math) && host.queries
          ? await loadKittyGraphics(host.queries)
          : undefined
      const fg = resolveAnsiStyle("mdMath", ctx.style.theme).fg
      const color = typeof fg === "string" && fg.startsWith("#") ? fg : undefined
      const ordinals = new Map<string, number>()
      const rowsByEntry: string[][] = []
      const used = new Set<string>()
      await Promise.all(
        entries.map(async (entry, idx) => {
          if (entry.math && (!graphics?.supported || !color)) {
            rowsByEntry[idx] = [entry.alt]
            return
          }
          const identity = entry.math
            ? `math:${JSON.stringify([entry.math.tex, entry.math.display, color])}`
            : entry.src
          const ord = ordinals.get(identity) ?? 0
          ordinals.set(identity, ord + 1)
          const key = `${identity}\u0000${ord}`
          used.add(key)
          let img = cache.get(key)
          if (img === undefined) {
            let src = entry.src
            let width: number | undefined
            if (entry.math) {
              try {
                const { mathImage } = await import("./math.ts")
                src = await mathImage(entry.math, color!)
                const { fileDetect } = await import("@zaly/shared/detect")
                const { imageInfo } = await import("@zaly/shared/image")
                const detected = await fileDetect(src)
                if (detected?.type !== "image") throw new Error("Expected a math SVG")
                const info = await imageInfo(detected)
                width = Math.max(1, Math.ceil(info.width / MATH_PIXELS_PER_CELL))
              } catch {
                rowsByEntry[idx] = [entry.alt]
                return
              }
            }
            img = new Image({ alt: entry.alt, src, width })
            host.add(img)
            cache.set(key, img)
          }
          try {
            rowsByEntry[idx] = await img.render(ctx)
          } catch (error) {
            if (!entry.math) throw error
            rowsByEntry[idx] = [entry.alt]
          }
        })
      )

      for (const [key] of cache) {
        if (!used.has(key)) {
          const img = cache.get(key)
          if (img) {
            host.remove(img)
            cache.delete(key)
          }
        }
      }

      // Walk the rendered output line by line:
      //   - Marker alone on its line (whitespace + ANSI tolerated) →
      //     replace the line with the full image rows.
      //   - Marker mid-line → top-align image rows in a shared band.
      // Coordinates are terminal cells, not string offsets. As with tables,
      // subsequent wrapping to a narrower width can invalidate this layout.
      const out: string[] = []
      for (const line of rendered.split("\n")) {
        const matched = new Map<number, { entry: ImageEntry; rows: string[] }>()
        for (const m of line.matchAll(MARKER_RE)) {
          const idx = Number(m[1])
          if (entries[idx]) matched.set(idx, { entry: entries[idx], rows: rowsByEntry[idx] ?? [] })
        }

        if (matched.size === 0) {
          out.push(line)
          continue
        }

        if (matched.size === 1 && stripAnsi(line.replace(MARKER_RE, "")).trim() === "") {
          const img = matched.values().next().value
          if (img && img.rows.length > 0) {
            out.push(...img.rows)
            continue
          }
        }

        const band = [""]
        let cursor = 0
        for (const marker of line.matchAll(MARKER_RE)) {
          band[0] += line.slice(cursor, marker.index)
          const image = matched.get(Number(marker[1]))
          if (!image) {
            band[0] += marker[0]
          } else {
            const column = stringWidth(band[0])
            const rows = image.rows.length ? image.rows : [labelOf(image.entry)]
            band[0] += rows[0]
            for (let row = 1; row < rows.length; row++) {
              band[row] ??= ""
              band[row] += " ".repeat(Math.max(0, column - stringWidth(band[row]))) + rows[row]
            }
          }
          cursor = marker.index + marker[0].length
        }
        band[0] += line.slice(cursor)
        out.push(...band)
      }
      return out.join("\n")
    },
  }
}

/** Friendly inline placeholder for an image that can't render at this
 *  position. Math keeps its original source. Otherwise prefers the markdown alt text;
 *  falls back to the basename
 *  of the source path (so `[clip.png]` instead of `[/tmp/long/path/clip.png]`),
 *  and "image" for anything weirder. */
function labelOf(entry: ImageEntry): string {
  if (entry.math) return entry.alt
  const label = entry.alt !== "" ? entry.alt : basename(entry.src) || "image"
  return `[${label}]`
}

const MARKER_RE = /<img id=(\d+)>/g
