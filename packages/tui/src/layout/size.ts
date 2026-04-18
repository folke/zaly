import type { Size } from "../core/types.ts"

/**
 * Resolve a Size to cells, given the axis size available from the parent.
 *
 *  - `number` — passes through
 *  - `Pct` — percentage of `available`, rounded down
 *  - `'fill'` — full `available`
 *  - `'auto'` / `undefined` — returns undefined; caller measures content
 */
export function resolveSize(size: Size | undefined, available: number): number | undefined {
  if (size === undefined || size === "auto") return undefined
  if (size === "fill") return available
  if (typeof size === "number") return size
  return Math.floor((Number.parseFloat(size) / 100) * available)
}

export interface ClampOpts {
  min?: Size
  max?: Size
  available: number
}

/**
 * Clamp a value to [min, max]. Each bound may be a `Size` (number or `Pct`) or
 * undefined. When both bounds conflict, `min` wins — matches CSS/flex.
 */
export function clamp(value: number, opts: ClampOpts): number {
  const maxN = resolveSize(opts.max, opts.available)
  if (maxN !== undefined && value > maxN) value = maxN
  const minN = resolveSize(opts.min, opts.available)
  if (minN !== undefined && value < minN) value = minN
  return value
}
