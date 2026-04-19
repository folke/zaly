import type { RenderCtx } from "../core/ctx.ts"

import { NodeBase } from "../core/node.ts"
import { imageCapabilities } from "../style/image/capabilities.ts"
import { encode as encodeIterm2 } from "../style/image/iterm.ts"
import {
  allocatePlacementId,
  placement,
  resetTransmitCache,
  transmitOnce,
} from "../style/image/kitty.ts"
import { imageBytes, imageMetadata } from "../style/image/source.ts"

export interface ImageState {
  /**
   * Path to an image file. PNG passes through with zero decoding; other
   * formats (JPEG/WebP/GIF/AVIF/SVG) are read via image-meta for
   * dimensions and — for KGP terminals — converted once to a cached
   * temp PNG via sharp. iTerm2 accepts all formats natively.
   */
  src: string
  /** Display width in terminal cells. Defaults to `ctx.width`. */
  width?: number
  /**
   * Display height in terminal cells. When omitted, computed from the
   * source aspect ratio + `cellAspect`.
   */
  height?: number
  /** Fallback text shown on terminals without an image protocol. */
  alt?: string
  /**
   * Character cell aspect ratio (cellHeight / cellWidth). Most terminals
   * land around 2.0. Tweak if aspect-preserved images look stretched.
   */
  cellAspect?: number
}

export class Image extends NodeBase<ImageState> {
  // Stable placement id per node instance. KGP re-renders emit the same
  // (image id, placement id) pair — the spec guarantees this replaces
  // the prior placement without flicker.
  readonly #placementId = allocatePlacementId()

  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const protocol = imageCapabilities().protocol
    if (protocol === undefined) {
      return [this.state.alt ?? `[Image: ${this.state.src}]`]
    }

    const meta = await imageMetadata(this.state.src)
    const { cols, rows } = dims(this.state, meta, ctx.width)
    const blank = " ".repeat(cols)

    // Row 0 carries the protocol escape(s) at the target cursor position.
    // The escapes are APC (KGP) / OSC (iTerm2) — zero display width via
    // our runtime stringWidth shim — so layout sees only the trailing
    // `cols` spaces. Rows 1..r-1 are pure spaces that the image overlays.
    let lead: string
    if (protocol === "kitty") {
      const { imageId, transmit } = await transmitOnce(this.state.src)
      lead = transmit + placement(imageId, this.#placementId, { cols, rows })
    } else {
      const bytes = await imageBytes(this.state.src)
      lead = encodeIterm2(Buffer.from(bytes).toString("base64"), {
        height: `${rows}`,
        preserveAspectRatio: true,
        width: `${cols}`,
      })
    }

    const out: string[] = [lead + blank]
    for (let r = 1; r < rows; r++) out.push(blank)
    return out
  }
}

export function image(src: string, style?: Omit<ImageState, "src">): Image
export function image(state: ImageState): Image
export function image(first: string | ImageState, style?: Omit<ImageState, "src">): Image {
  if (typeof first === "string") return new Image({ src: first, ...style })
  return new Image(first)
}

function dims(
  state: ImageState,
  meta: { width: number; height: number },
  available: number
): { cols: number; rows: number } {
  const cellAspect = state.cellAspect ?? 2
  const aspect = meta.height / meta.width
  let cols = state.width
  let rows = state.height
  if (cols === undefined && rows === undefined) cols = Math.max(1, available)
  if (cols !== undefined && rows === undefined) {
    rows = Math.max(1, Math.round((cols * aspect) / cellAspect))
  } else if (rows !== undefined && cols === undefined) {
    cols = Math.max(1, Math.round((rows * cellAspect) / aspect))
  }
  return { cols: cols ?? available, rows: rows ?? 1 }
}

/** Drop the KGP transmit cache. Mostly for tests. */
export function resetImageTransmitCache(): void {
  resetTransmitCache()
}
