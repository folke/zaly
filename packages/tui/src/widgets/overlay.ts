import type { Node } from "../core/node.ts"
import type { State } from "../core/state.ts"
import type { BoxStyle } from "./box.ts"

import { Box } from "./box.ts"

export interface OverlayState extends BoxStyle {
  /** Absolute column (1-based) of the overlay's left edge. */
  x: number
  /** Absolute row (1-based) of the overlay's top edge. */
  y: number
  /** Higher zIndex paints on top. Default: 0. */
  zIndex?: number
}

/**
 * An overlay is a Box that the overlay surface paints at an absolute
 * position *after* the stream and UI have drawn. It's never part of
 * either surface's layout — its rows go straight to the terminal at
 * `(y, x)` via absolute-cursor moves.
 *
 * Open/close lifecycle lives on `renderer.overlay`:
 *
 * ```ts
 * const modal = overlay({ x: 10, y: 4, border: "rounded", padding: 1 },
 *   text("Hello world"))
 * renderer.overlay.open(modal)
 * // ... later
 * renderer.overlay.close(modal)
 * ```
 */
export class Overlay extends Box {
  static readonly type = "overlay"
  override readonly type = Overlay.type
  /** Narrow `state` to the Overlay shape without re-initialising the field. */
  declare readonly state: State<OverlayState>

  /**
   * Close this overlay via the MountCtx. Symmetric counterpart to
   * `ctx.overlay.open(overlay)` or `renderer.overlay.open(overlay)` —
   * once open, an overlay is mounted and can dismiss itself via its
   * own `ctx`. No-op if the overlay isn't currently open. Returns
   * `this` for chaining.
   *
   * There's no corresponding `open()` method because an overlay isn't
   * mounted until it's opened, so it has no `ctx` to reach the
   * OverlaySurface through. Open via `ctx.overlay.open(overlay)` from
   * a mounted widget, or `renderer.overlay.open(overlay)` from app code.
   */
  close(): this {
    this.ctx?.overlay.close(this)
    return this
  }
}

type Child = Node | false | null | undefined

export function overlay(state: State<OverlayState>, ...children: Child[]): Overlay {
  const o = new Overlay(state)
  for (const c of children) if (c) o.add(c)
  return o
}
