import type { Flexible } from "../core/state.ts"

import { sliceAnsi, stringWidth } from "../style/ansi.ts"
import { clamp, resolveSize } from "./size.ts"

/**
 * Items participating in a row-direction allocation. Extends the
 * `Flexible` mixin (`width / minWidth / maxWidth / flexGrow`) with a
 * measured `natural` size used as the flex-basis when no fixed width
 * is set. Rendered out of `Node.state` by `Box`.
 *
 * @internal
 */
export interface RowItem extends Flexible {
  /** Measured natural (content) width — used as the flex-basis when
   *  no fixed `width` is set. Falls back to 0 when omitted. */
  natural?: number
}

export interface AllocateOpts {
  contentWidth: number
  gap: number
}

/**
 * Allocate widths to row-direction children with CSS `flex: 0 1 auto`
 * semantics. Each item starts at its **basis**:
 *
 *   - `width: <number | "N%">` → resolved fixed width.
 *   - `width: "fill"` or any non-fixed spec → `natural` (content size,
 *     0 when not provided).
 *
 * Slack (`available - sum(basis)`) only flows to items with positive
 * `flexGrow` or `width: "fill"` (which implies `flexGrow: 1`). Items
 * without either stay at their basis — leftover slack is *not*
 * redistributed to siblings (callers/parents pad the row to fill).
 * `min`/`max` clamp per-item; rounding remainder lands on the last
 * grower.
 *
 * @internal
 */
export function allocateRow(items: readonly RowItem[], opts: AllocateOpts): number[] {
  const { contentWidth } = opts
  const gapTotal = opts.gap * Math.max(0, items.length - 1)
  const available = contentWidth - gapTotal

  const bases: number[] = Array.from({ length: items.length })
  const grows: number[] = Array.from({ length: items.length })
  let baseSum = 0
  let growSum = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (isFixedWidth(item.width)) {
      bases[i] = resolveSize(item.width, contentWidth) ?? 0
      grows[i] = 0
    } else {
      bases[i] = item.natural ?? 0
      // `width: "fill"` with no explicit `flexGrow` implies grow 1 —
      // fill is the way callers say "claim slack" without a numeric
      // weight.
      grows[i] = item.flexGrow ?? (item.width === "fill" ? 1 : 0)
    }
    baseSum += bases[i]
    growSum += grows[i]
  }

  const slack = Math.max(0, available - baseSum)
  const widths: number[] = Array.from({ length: items.length })
  let allocated = 0
  let lastGrowIndex = -1

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    let w = bases[i]
    if (growSum > 0 && grows[i] > 0) {
      w += Math.floor((slack * grows[i]) / growSum)
      lastGrowIndex = i
    }
    w = clamp(w, { available: contentWidth, max: item.maxWidth, min: item.minWidth })
    widths[i] = w
    allocated += w
  }

  // Tail grower absorbs rounding remainder and any over/underflow from
  // min/max clamps. We aim at `baseSum + slack` (i.e. `available` capped
  // at non-negative slack), not `available` — when there are no growers
  // and bases sum to less than `available`, the leftover is real slack
  // that the parent will pad as end-of-row space, not a remainder to
  // smear onto siblings.
  if (lastGrowIndex !== -1) {
    const target = baseSum + slack
    if (allocated !== target) {
      widths[lastGrowIndex] = Math.max(0, widths[lastGrowIndex] + (target - allocated))
    }
  }

  return widths
}

/**
 * Whether a `Flexible.width` spec is a fixed numeric size (number or
 * `Pct`). `"fill"`/`"fit"`/undefined are non-fixed and resolve from
 * surrounding context (slack / measurement).
 *
 * @internal
 */
export function isFixedWidth(w: Flexible["width"]): boolean {
  return typeof w === "number" || (typeof w === "string" && w.endsWith("%"))
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

export interface StackOpts {
  gap: number
  width: number
}

/**
 * Stack pre-rendered child rows vertically. `gap` blank rows of `width`
 * spaces separate each sibling pair that *contributes rows*. Children
 * that emit no rows (e.g. `visible: false`, falsy `show()` branch) are
 * skipped along with the gap that would have surrounded them — no
 * stray blank bands. Caller must ensure each child's rows are already
 * padded to `width`.
 *
 * @internal
 */
export function stackColumn(children: readonly (readonly string[])[], opts: StackOpts): string[] {
  const out: string[] = []
  const blank = " ".repeat(opts.width)
  let any = false
  for (const child of children) {
    if (child.length === 0) continue
    if (any) for (let g = 0; g < opts.gap; g++) out.push(blank)
    out.push(...child)
    any = true
  }
  return out
}

/**
 * Pad a row to `width` cells without injecting a `RESET`. Used by the
 * row/column zip-and-pad steps — the parent `Box`'s outer
 * `reapplyStyle` chain handles re-emitting any ambient SGR after inner
 * `[0m`s, so the pad cells stay inside the active style. Over-wide
 * rows are clipped via `sliceAnsi`, preserving SGR state.
 *
 * Distinct from `padOrClip` in `style/ansi.ts`, which is for
 * standalone (non-Box-wrapped) paths and *does* inject a `RESET`
 * before the pad.
 *
 * @internal
 */
export function padRow(row: string, width: number): string {
  const w = stringWidth(row)
  if (w === width) return row
  if (w < width) return row + " ".repeat(width - w)
  return sliceAnsi(row, 0, width)
}
