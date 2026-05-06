import type { Size } from "../layout/size.ts"
import type { Style } from "../style/types.ts"
import type { Reactive } from "./reactive.ts"

/**
 * Fields every Node reads off its state. Widget state types should
 * extend this (directly or transitively via `Style`, which extends
 * `BaseState`) so the base behaviour wires up automatically.
 *
 *   - `visible: false` suppresses rendering with zero layout footprint.
 *     Accepts a `Reactive<boolean>` — pass a signal accessor to toggle
 *     visibility from shared state. `Node.render` unwraps it at render
 *     time so the subscription goes through the usual tracking ctx.
 */
type BaseState = {
  visible?: Reactive<boolean>
}

export type State<T extends object = object> = T & BaseState & Flexible

/** Widget state mixin: `Style` (fg/bg/attrs) plus `BaseState`
 *  (visibility + any future framework-level state fields). Widget state
 *  interfaces extend this so base-state concerns and pure styling stay
 *  cleanly separated at the type level without each widget having to
 *  compose the two manually. */
export type StyleState = Style

/**
 * Fields a flex-row child contributes to the allocator. Widget state
 * types that want to participate in `flexDirection: "row"` layout
 * (Box, Text, and anything else where per-child sizing makes sense)
 * extend this interface.
 *
 * `allocateRow` reads these fields off each child's `state` — having
 * them in one shared shape means widgets opt in explicitly without
 * Box's row code needing per-widget casts.
 */
export interface Flexible {
  /** Requested width. `"fill"` requests whatever remains after fixed
   *  children; a number requests exactly that many columns. */
  width?: Size
  /** Floor for allocated width. */
  minWidth?: Size
  /** Ceiling for allocated width. */
  maxWidth?: Size
  /** Weight used to distribute remaining space. Higher weight = more
   *  growth. Unset children default to weight 1 if requested `"fill"`. */
  flexGrow?: number
}
