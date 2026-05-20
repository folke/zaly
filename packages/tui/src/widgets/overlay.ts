import type { Node } from "../core/node.ts"
import type { State } from "../core/state.ts"
import type { Box, BoxStyle } from "./box.ts"

import { box } from "./box.ts"

export interface OverlayState {
  /** Absolute column (1-based) of the overlay's left edge. */
  x: number
  /** Absolute row (1-based) of the overlay's top edge. */
  y: number
  /** Higher zIndex paints on top. Default: 0. */
  zIndex?: number
  verticalAnchor?: "top" | "center" | "bottom"
}

export type Overlay = Box<OverlayState>

type Child = Node | false | null | undefined

export function overlay(state: State<OverlayState & BoxStyle>, ...children: Child[]): Overlay {
  return box({ visible: false, ...state }, ...children) as Overlay
}
