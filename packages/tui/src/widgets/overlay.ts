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
  relative?: "screen" | "ui" | "stream"
}

export type Overlay<T extends Node[] = Node[]> = Box<OverlayState> & { children: T }

export function overlay<T extends Node[] = Node[]>(
  state: State<OverlayState & BoxStyle>,
  ...children: T
): Overlay<T> {
  return box({ visible: false, ...state }, ...children) as Overlay<T>
}
