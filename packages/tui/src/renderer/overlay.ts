import type { MountCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Overlay } from "../widgets/overlay.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { createNode, withOwner } from "../core/reactive.ts"
import { Surface } from "./surface.ts"

export type OverlayRenderState = {
  x: number
  y: number
  width: number
  height: number
}

export type OverlaySurfaceEvents = {
  "render-node": { node: Node } & OverlayRenderState
}

/**
 * Overlay surface — paints absolute-positioned `Overlay` nodes on top
 * of the stream and UI surfaces after each tick.
 *
 * Open/close is explicit. While an overlay is open, mutations on its
 * state (or its subtree) bubble through `invalidate` → this surface's
 * `dirty` → Renderer's scheduler, same as the other surfaces. On
 * close, the covered area is overdrawn by asking the stream and UI
 * to invalidate so the next flush repaints them in full.
 *
 * v1 is intentionally minimal:
 *   - Overlays are painted top-to-bottom in z-order on every flush; we
 *     don't track per-overlay dirty flags, just paint all active ones.
 *   - No clipping against the viewport — callers are responsible for
 *     sizing / positioning sensibly. The stream lives inside DECSTBM,
 *     so overlays that touch row 0 can disrupt scrollback.
 */
export class OverlaySurface extends Surface<OverlaySurfaceEvents> {
  readonly type = "overlay"
  readonly #overlays: Overlay[] = []

  get bounds(): { top: number; bottom: number } {
    return { bottom: this.$r.terminal.rows, top: 1 }
  }

  override get dirty(): boolean {
    return this.active.length > 0 || super.dirty
  }

  /** Active overlays in paint order (low → high z-index). */
  get active(): readonly Overlay[] {
    return this.#overlays.filter((o) => o.visible && o.ctx !== undefined)
  }

  /** Register an overlay with the surface. Function form runs `fn`
   *  inside a fresh Owner scope and adopts the returned Overlay. */
  add<O extends Overlay>(overlay: () => O): O {
    const resolved = withOwner(this.$r.rootOwner, () => createNode(overlay))
    if (this.#overlays.includes(resolved)) return resolved
    this.#overlays.push(resolved)
    this.#overlays.sort((a, b) => (a.state.zIndex ?? 0) - (b.state.zIndex ?? 0))
    resolved.on("invalidate", this.invalidate)
    const ctx = this.mountCtx
    if (this.running && ctx) resolved.mount(ctx)
    if (resolved.visible) this.invalidate()
    return resolved
  }

  remove(overlay: Overlay): this {
    const i = this.#overlays.indexOf(overlay)
    if (i === -1) return this
    if (overlay.mounted) overlay.unmount()
    this.#overlays.splice(i, 1)
    overlay.off("invalidate", this.invalidate)
    this.invalidate()
    return this
  }

  open<T extends Overlay = Overlay>(overlay: () => T): T {
    return this.add(overlay).show()
  }

  close(overlay: Overlay): this {
    overlay.hide()
    this.remove(overlay)
    return this
  }

  /** Every currently-open overlay node, for renderer traversals. */
  get nodes(): readonly Node[] {
    return this.#overlays
  }

  protected mountAll(ctx: MountCtx): void {
    for (const o of this.#overlays) if (!o.mounted) o.mount(ctx)
  }

  protected unmountAll(): void {
    // Active set is preserved so a subsequent `onStart()` remounts the
    // same stack in z-order.
    for (const o of this.#overlays) if (o.mounted) o.unmount()
  }

  /**
   * Render pass: compute rows for each active overlay, then paint them
   * at their absolute `(y, x)` inside the outer sync block. Matches the
   * `render(sync?)` shape used by Stream and UI so the Renderer can
   * capture all three paints and emit them in one atomic frame.
   */
  async _render(run: (fn: () => void) => void): Promise<void> {
    const painted: { x: number; y: number; rows: string[] }[] = []
    const ctx = this.$r.ctx
    await Promise.all(
      this.active.map(async (node) => {
        // Width and height are honoured by the box layout itself
        // (`width: "fit" | number` and the `height` + `verticalAlign`
        // pair on `BoxStyle`). We pass ctx unchanged and trust the
        // overlay's own state to size correctly.
        const rows = await node.render(ctx)
        let x = node.state.x
        let y = node.state.y
        if (x < 0) x = this.$r.terminal.cols + x // Allow negative x to position relative to right edge

        let refY = 1
        let refHeight = this.$r.terminal.rows

        if (node.state.relative === "ui") {
          refHeight = this.$r.ui.height
          refY = this.$r.terminal.footerTop
        } else if (node.state.relative === "stream") {
          refHeight = this.$r.stream.liveHeight
        }

        const anchorY = y < 0 ? refY + refHeight + y : refY + y - 1

        const a = node.state.verticalAnchor ?? "top"
        if (a === "bottom") y = anchorY - rows.length + 1
        else if (a === "center") y = anchorY - Math.floor(rows.length / 2)
        else y = anchorY
        painted.push({ rows, x, y })
        void this.emit("render-node", {
          height: rows.length,
          node,
          width: Math.max(...rows.map((r) => stringWidth(r))),
          x,
          y,
        })
      })
    )
    run(() => {
      for (const { rows, x, y } of painted) {
        for (let r = 0; r < rows.length; r++) {
          this.$r.terminal.write(this.$r.terminal.moveTo(y + r, x) + rows[r])
        }
      }
      // Mark the covered rows stale in stream's tracked-rows snapshot
      // so its NEXT render diff-rewrites them with real stream bytes
      // before the `\n`-at-scrollBottom growth path. Without this, an
      // overlay-overlaid row that scrolled into scrollback would land
      // there carrying overlay bytes instead of stream content.
      for (const { rows, y } of painted) {
        if (rows.length > 0) {
          this.$r.stream.markStale(y, y + rows.length - 1)
          this.$r.ui.markStale(y, y + rows.length - 1)
        }
      }
    })
  }
}
