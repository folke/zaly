import type { MountCtx, RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Overlay } from "../widgets/overlay.ts"
import type { Stream } from "./stream.ts"
import type { Terminal } from "./terminal.ts"
import type { UI } from "./ui.ts"

import { Surface } from "./surface.ts"

export interface OverlayDeps {
  terminal: Terminal
  getCtx: () => RenderCtx
  stream: Stream
  ui: UI
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
export class OverlaySurface extends Surface {
  readonly #active: Overlay[] = []

  constructor(private readonly deps: OverlayDeps) {
    super()
  }

  /** Active overlays in paint order (low → high z-index). */
  get active(): readonly Overlay[] {
    return this.#active
  }

  /** Show `overlay`. No-op if it's already open. */
  open(overlay: Overlay): this {
    if (this.#active.includes(overlay)) return this
    this.#active.push(overlay)
    this.#active.sort((a, b) => (a.state.zIndex ?? 0) - (b.state.zIndex ?? 0))
    overlay.on("invalidate", this.onDirty)
    const ctx = this.mountCtx
    if (this.running && ctx) overlay.mount(ctx)
    this.emit("dirty")
    return this
  }

  /**
   * Hide `overlay`. The stream's `markStale` state from the most recent
   * paint already tells it to rewrite the overlay-covered rows on the
   * next tick, so we only need to kick the UI into a full repaint —
   * UI has no equivalent staleness channel and would otherwise leave
   * overlay bytes visible on its footer.
   */
  close(overlay: Overlay): this {
    const i = this.#active.indexOf(overlay)
    if (i === -1) return this
    if (overlay.mounted) overlay.unmount()
    this.#active.splice(i, 1)
    overlay.off("invalidate", this.onDirty)
    this.deps.ui.invalidate()
    this.emit("dirty")
    return this
  }

  /** Every currently-open overlay node, for renderer traversals. */
  get nodes(): readonly Node[] {
    return this.#active
  }

  protected mountAll(ctx: MountCtx): void {
    for (const o of this.#active) if (!o.mounted) o.mount(ctx)
  }

  protected unmountAll(): void {
    // Active set is preserved so a subsequent `onStart()` remounts the
    // same stack in z-order.
    for (const o of this.#active) if (o.mounted) o.unmount()
  }

  /**
   * Render pass: compute rows for each active overlay, then paint them
   * at their absolute `(y, x)` inside the outer sync block. Matches the
   * `render(sync?)` shape used by Stream and UI so the Renderer can
   * capture all three paints and emit them in one atomic frame.
   */
  async render(sync?: (fn: () => void) => void): Promise<void> {
    const run = sync ?? ((fn: () => void) => this.deps.terminal.sync(fn))
    const painted: { x: number; y: number; rows: string[] }[] = []
    const ctx = this.deps.getCtx()
    await Promise.all(
      this.#active.map(async (o) => {
        // Use the overlay's natural width if it doesn't set one (box
        // handles `fill` vs numeric); we pass ctx unchanged and let the
        // box layout decide how wide it wants to be against `ctx.width`.
        const rows = await o.render(ctx)
        painted.push({ rows, x: o.state.x, y: o.state.y })
      })
    )
    run(() => {
      for (const { rows, x, y } of painted) {
        for (let r = 0; r < rows.length; r++) {
          this.deps.terminal.write(this.deps.terminal.moveTo(y + r, x) + rows[r])
        }
      }
      // Mark the covered rows stale in stream's tracked-rows snapshot
      // so its NEXT render diff-rewrites them with real stream bytes
      // before the `\n`-at-scrollBottom growth path. Without this, an
      // overlay-overlaid row that scrolled into scrollback would land
      // there carrying overlay bytes instead of stream content.
      for (const { rows, y } of painted) {
        if (rows.length > 0) {
          this.deps.stream.markStale(y, y + rows.length - 1)
        }
      }
    })
  }
}
