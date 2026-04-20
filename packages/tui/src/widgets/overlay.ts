import type { Node } from "../core/node.ts"
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
  declare readonly state: OverlayState
}

type Child = Node | false | null | undefined

export function overlay(state: OverlayState, ...children: Child[]): Overlay {
  const o = new Overlay(state)
  for (const c of children) if (c) o.add(c)
  return o
}
