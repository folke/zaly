import type { Size } from "./size.ts"

import { clamp, resolveSize } from "./size.ts"

export interface RowItem {
  width?: Size
  minWidth?: Size
  maxWidth?: Size
  flexGrow?: number
}

export interface AllocateOpts {
  contentWidth: number
  gap: number
}

/**
 * Allocate widths to row-direction children per §9.4. Widths that are `number`
 * or `Pct` are treated as fixed. Items without a fixed width default to flex
 * weight 1 (or `flexGrow` if provided, or 1 for explicit `'fill'`). Remaining
 * space is distributed proportionally; min/max clamp each result; any rounding
 * remainder lands on the last flex item.
 *
 * @internal
 */
export function allocateRow(items: readonly RowItem[], opts: AllocateOpts): number[] {
  const { contentWidth } = opts
  const gapTotal = opts.gap * Math.max(0, items.length - 1)
  const available = contentWidth - gapTotal

  const fixed: (number | undefined)[] = Array.from({ length: items.length })
  let fixedSum = 0
  let weightSum = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const resolved = resolveSize(item.width, contentWidth)
    const isFixedSpec =
      typeof item.width === "number" || (typeof item.width === "string" && item.width.endsWith("%"))
    if (isFixedSpec && resolved !== undefined) {
      fixed[i] = resolved
      fixedSum += resolved
    } else {
      weightSum += item.flexGrow ?? 1
    }
  }

  const remaining = Math.max(0, available - fixedSum)
  const widths: number[] = Array.from({ length: items.length })
  let allocated = 0
  let lastFlexIndex = -1

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const fixedW = fixed[i]
    let w: number
    if (fixedW !== undefined) {
      w = fixedW
    } else {
      const weight = item.flexGrow ?? 1
      w = Math.floor((remaining * weight) / weightSum)
      lastFlexIndex = i
    }
    w = clamp(w, { available: contentWidth, max: item.maxWidth, min: item.minWidth })
    widths[i] = w
    allocated += w
  }

  // Tail flex absorbs any rounding remainder (and any overflow/underflow from
  // min/max clamping on earlier siblings) so we land on `available`.
  if (lastFlexIndex !== -1 && allocated !== available) {
    widths[lastFlexIndex] = Math.max(0, widths[lastFlexIndex] + (available - allocated))
  }

  return widths
}

export interface ZipOpts {
  widths: readonly number[]
  gap: number
}

/**
 * Zip pre-rendered child rows horizontally. Shorter children are padded with
 * blank rows of their allocated width. Rows of each child must already be
 * padded to the corresponding width in `widths`.
 *
 * @internal
 */
export function zipRow(children: readonly (readonly string[])[], opts: ZipOpts): string[] {
  if (children.length === 0) return []
  const gapStr = " ".repeat(opts.gap)
  const height = children.reduce((h, rows) => Math.max(h, rows.length), 0)
  const out: string[] = []
  for (let r = 0; r < height; r++) {
    let line = ""
    for (let c = 0; c < children.length; c++) {
      if (c > 0) line += gapStr
      const rows = children[c]
      line += r < rows.length ? rows[r] : " ".repeat(opts.widths[c])
    }
    out.push(line)
  }
  return out
}
