import type { Emitter } from "@zaly/shared"
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
  horizontalAnchor?: "left" | "center" | "right"
  relative?: "screen" | "ui" | "stream"
  /** If true, the overlay will be automatically removed from the renderer when closed.
   * When false, the overlay will remain in the renderer but will be hidden.
   * Default: true. */
  removeOnClose?: boolean
}

type OverlayEvents = {
  close: {}
}

export type Overlay<T extends Node[] = Node[]> = Box<OverlayState> & {
  children: T
} & Emitter<OverlayEvents>

export function overlay<T extends Node[] = Node[]>(
  state: State<OverlayState & BoxStyle>,
  ...children: T
): Overlay<T> {
  const node = box({ visible: false, ...state }, ...children) as Overlay<T>
  node.withActions({
    "overlay.close": {
      desc: "Close overlay",
      fn: () => ((node.state.removeOnClose ?? true) ? node.ctx?.overlay.remove(node) : node.hide()),
      keys: ["esc", "ctrl-c"],
    },
  })
  return node
}
