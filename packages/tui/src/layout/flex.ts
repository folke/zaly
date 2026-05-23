import type { FlexState } from "../core/state.ts"

import { sliceAnsi, stringWidth } from "@zaly/shared/ansi"
import { clamp, resolveSize } from "./size.ts"

/**
 * Items participating in a row-direction allocation. Extends the
 * `Flexible` mixin with the node's intrinsic content sizes (from
 * `Node.layout()` or fallback measurement). Box constructs these
 * before calling `allocateRow`.
 *
 * @internal
 */
export interface RowItem extends FlexState {
  /** Measured natural (max-content) width — used as the flex-basis
   *  when no fixed `width` is set. Falls back to 0 when omitted. */
  natural?: number
  /** Intrinsic min-content width — the smallest the node can render
   *  without breaking content. Acts as a shrink floor below which the
   *  allocator won't go (combined with `Flexible.minWidth`). */
  intrinsicMin?: number
}

export interface AllocateOpts {
  contentWidth: number
  gap: number
}

/**
 * Allocate widths to row-direction children with CSS-style flex
 * semantics. Each item starts at its **basis**:
 *
 *   - `width: <number | "N%">` → resolved fixed width.
 *   - `width: "fill"` → 0 (claim slack, ignore intrinsic).
 *   - any other non-fixed spec → `natural` (content size, 0 when not
 *     provided).
 *
 * Three branches:
 *
 *   - `slack > 0`: distribute by `flexGrow`. Items without grow weight
 *     stay at basis; leftover slack is *not* smeared onto siblings.
 *   - `slack < 0` (deficit): distribute the shortfall by
 *     `basis * flexShrink` (CSS shrink default = 1). Each item is
 *     clamped at its `minWidth` floor so content doesn't break.
 *   - `slack == 0`: items take their basis as-is.
 *
 * `min`/`max` (combined with `intrinsicMin`) clamp per-item; rounding
 * remainder lands on the last grower / shrinker.
 *
 * @internal
 */
export function allocateRow(items: readonly RowItem[], opts: AllocateOpts): number[] {
  const { contentWidth } = opts
  const gapTotal = opts.gap * Math.max(0, items.length - 1)
  const available = contentWidth - gapTotal

  const bases: number[] = Array.from({ length: items.length })
  const grows: number[] = Array.from({ length: items.length })
  const shrinks: number[] = Array.from({ length: items.length })
  // Effective minimum per item — the larger of the user-set `minWidth`
  // and the node's intrinsic `min-content`. Shrink can't go below this.
  const mins: number[] = Array.from({ length: items.length })
  let baseSum = 0
  let growSum = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (isFixedWidth(item.width)) {
      bases[i] = resolveSize(item.width, contentWidth) ?? 0
      grows[i] = 0
      shrinks[i] = 0 // Fixed-width items never shrink — author asked for an exact size.
    } else if (item.width === "fill") {
      // `fill` claims slack and ignores intrinsic basis (CSS `flex: 1 1 0`).
      bases[i] = 0
      grows[i] = item.flexGrow ?? 1
      shrinks[i] = item.flexShrink ?? 1
    } else {
      bases[i] = item.natural ?? 0
      grows[i] = item.flexGrow ?? 0
      shrinks[i] = item.flexShrink ?? 1
    }
    const intrinsicMin = item.intrinsicMin ?? 0
    const userMin = resolveSize(item.minWidth, contentWidth) ?? 0
    mins[i] = Math.max(intrinsicMin, userMin)
    baseSum += bases[i]
    growSum += grows[i]
  }

  const slack = available - baseSum
  const widths: number[] = Array.from({ length: items.length })
  let allocated = 0
  let lastGrowIndex = -1
  let lastShrinkIndex = -1

  if (slack >= 0) {
    // Grow phase — distribute slack among items that asked for it.
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      let w = bases[i]
      if (growSum > 0 && grows[i] > 0) {
        w += Math.floor((slack * grows[i]) / growSum)
        lastGrowIndex = i
      }
      w = clamp(w, { available: contentWidth, max: item.maxWidth, min: mins[i] })
      widths[i] = w
      allocated += w
    }
    // Tail grower absorbs rounding remainder and any over/underflow
    // from min/max clamps. We aim at `baseSum + slack` (i.e. exactly
    // `available`) only when growers exist; otherwise leftover is real
    // slack the parent will pad as end-of-row space.
    if (lastGrowIndex !== -1) {
      const target = baseSum + slack
      if (allocated !== target) {
        widths[lastGrowIndex] = Math.max(0, widths[lastGrowIndex] + (target - allocated))
      }
    }
  } else {
    // Shrink phase — distribute the deficit weighted by `basis * shrink`.
    // Items at their `mins[i]` floor stop shrinking; the remaining
    // deficit re-routes to the others. Iterate until stable or no
    // shrinkable items remain.
    for (let i = 0; i < items.length; i++) widths[i] = bases[i]
    let deficit = -slack // positive
    const frozen: boolean[] = Array.from({ length: items.length }, () => false)
    // Cap loop at items.length+1 — each pass freezes at least one item
    // or fully resolves the deficit. Bounded, no risk of looping.
    for (let pass = 0; pass <= items.length && deficit > 0; pass++) {
      let weightSum = 0
      for (let i = 0; i < items.length; i++) {
        if (!frozen[i]) weightSum += widths[i] * shrinks[i]
      }
      if (weightSum === 0) break // nothing left can shrink
      let froze = false
      for (let i = 0; i < items.length; i++) {
        if (frozen[i]) continue
        const share = Math.floor((deficit * widths[i] * shrinks[i]) / weightSum)
        const next = widths[i] - share
        if (next <= mins[i]) {
          deficit -= widths[i] - mins[i]
          widths[i] = mins[i]
          frozen[i] = true
          froze = true
        } else {
          widths[i] = next
          lastShrinkIndex = i
        }
      }
      if (!froze) {
        // Apply remaining deficit proportionally one more time without
        // freezing — the round above didn't hit any floor.
        deficit = 0
      }
    }
    for (let i = 0; i < items.length; i++) {
      widths[i] = clamp(widths[i], {
        available: contentWidth,
        max: items[i].maxWidth,
        min: mins[i],
      })
      allocated += widths[i]
    }
    // Soak any rounding-shaped over/underflow into the last shrinker so
    // the row sums exactly to `available` (or to the minSum floor when
    // mins force overflow).
    if (lastShrinkIndex !== -1) {
      const target = Math.max(
        available,
        mins.reduce((a, b) => a + b, 0)
      )
      if (allocated !== target) {
        const adj = target - allocated
        widths[lastShrinkIndex] = Math.max(mins[lastShrinkIndex], widths[lastShrinkIndex] + adj)
      }
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
export function isFixedWidth(w: FlexState["width"]): boolean {
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
