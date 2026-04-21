import type { Size } from "./size.ts"

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
