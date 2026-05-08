import type { RenderCtx } from "../core/ctx.ts"
import type { State } from "../core/state.ts"
import type { BorderSpec, TitleAlign } from "../layout/border.ts"
import type { RowItem } from "../layout/flex.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/types.ts"

import { Node } from "../core/node.ts"
import { drawBorder, resolveBorder } from "../layout/border.ts"
import { allocateRow, isFixedWidth, padRow, stackColumn, zipRow } from "../layout/flex.ts"
import { clamp, resolveSize } from "../layout/size.ts"
import { stringWidth } from "../style/ansi.ts"

export type Padding =
  | number
  | readonly [v: number, h: number]
  | readonly [t: number, r: number, b: number, l: number]

export interface BoxStyle extends Style {
  flexDirection?: "row" | "column"
  gap?: number
  height?: Size
  minHeight?: Size
  maxHeight?: Size
  padding?: Padding
  border?: BorderSpec
  borderTitle?: string
  /** Placement of `borderTitle` along the top border. Defaults to `"left"`. */
  borderTitleAlign?: TitleAlign
  /**
   * Style applied to the border glyphs. Either a theme slot name (resolved
   * via the active theme) or an inline `Style`. Defaults to the `"border"`
   * theme slot when a border is drawn.
   */
  borderStyle?: string | Style
  /**
   * Style applied to the border title. Defaults to the `"borderTitle"` theme
   * slot when a title is set.
   */
  borderTitleStyle?: string | Style
}

export class Box extends Node<BoxStyle> {
  protected async _render(ctx: RenderCtx): Promise<string[]> {
    const style = this.state

    const [padT, padR, padB, padL] = resolvePadding(style.padding)
    const bchars = resolveBorder(style.border)
    const hasBorder = bchars !== undefined
    const chrome = padL + padR + (hasBorder ? 2 : 0)

    let outer: number
    let contentRows: string[]
    let inner: number

    if (style.width === "fit") {
      // `fit`: render children at the parent's max inner width, measure
      // the natural max-row width, then clamp the box to that. Two-pass
      // — the first pass uses the upper bound as a measuring window,
      // the second re-pads each row to the chosen inner width.
      const upper = Math.max(0, ctx.width - chrome)
      const tentative = await this.#layoutChildren(upper, ctx)
      const natural = tentative.reduce((m, r) => Math.max(m, stringWidth(r)), 0)
      const fit = Math.min(ctx.width, natural + chrome)
      outer = clamp(fit, {
        available: ctx.width,
        max: style.maxWidth,
        min: style.minWidth,
      })
      inner = Math.max(0, outer - chrome)
      contentRows = tentative
    } else {
      const requested = resolveSize(style.width ?? "fill", ctx.width) ?? ctx.width
      outer = clamp(requested, {
        available: ctx.width,
        max: style.maxWidth,
        min: style.minWidth,
      })
      inner = Math.max(0, outer - chrome)
      contentRows = await this.#layoutChildren(inner, ctx)
    }

    const paddedWidth = Math.max(0, outer - (hasBorder ? 2 : 0))

    // Ensure each content row is exactly `inner` cells wide (absorbs slack).
    contentRows = contentRows.map((row) => padRow(row, inner))

    // Horizontal padding.
    if (padL > 0 || padR > 0) {
      const lp = " ".repeat(padL)
      const rp = " ".repeat(padR)
      contentRows = contentRows.map((row) => lp + row + rp)
    }

    // Vertical padding.
    const blank = " ".repeat(paddedWidth)
    const top = Array.from({ length: padT }, () => blank)
    const bot = Array.from({ length: padB }, () => blank)
    let rows = [...top, ...contentRows, ...bot]

    if (bchars) {
      rows = drawBorder(rows, bchars, {
        borderStyle: ctx.style.add(style.borderStyle ?? "border"),
        title: style.borderTitle,
        titleAlign: style.borderTitleAlign,
        titleStyle: ctx.style.add(style.borderTitleStyle ?? "borderTitle"),
      })
    }

    const wrap = ctx.style.add(style)
    return rows.map((row) => wrap(row))
  }

  /**
   * Intrinsic content width derived from children (or the explicit
   * `width` when fixed). Lets parent flex containers size this Box
   * without falling back to a measure-render — important for
   * side-effecting children like `Image` whose first render allocates
   * a KGP placement: rendering twice would emit two placements and the
   * second render's `transmitOnce` returns no bytes, so the bytes from
   * the discarded measure pass would be lost.
   *
   * Row direction → bases sum (plus gaps). Column direction → bases
   * max. Both add chrome (padding + border) at the end.
   *
   * Children without `layout()` contribute 0 — the row allocator's
   * render-measure fallback still kicks in for them at allocation
   * time, but their absence here just means this Box reports a
   * smaller intrinsic. That's the safe direction: under-report and
   * let shrink/grow handle slack, never over-report.
   */
  override layout(ctx: RenderCtx) {
    const s = this.state
    const [, padR, , padL] = resolvePadding(s.padding)
    const chrome = padL + padR + (resolveBorder(s.border) ? 2 : 0)

    // Fixed width wins outright.
    if (isFixedWidth(s.width)) {
      const w = resolveSize(s.width, ctx.width) ?? 0
      return { minWidth: w, width: w }
    }

    const kids = layoutNodes(this.children)
    if (kids.length === 0) return { minWidth: chrome, width: chrome }

    const isRow = (s.flexDirection ?? "column") === "row"
    const totalGap = isRow ? (s.gap ?? 0) * Math.max(0, kids.length - 1) : 0

    let widthAcc = 0
    let minAcc = 0
    for (const k of kids) {
      const l = k.getLayout(ctx) ?? { minWidth: 0, width: 0 }
      if (isRow) {
        widthAcc += l.width
        minAcc += l.minWidth
      } else {
        widthAcc = Math.max(widthAcc, l.width)
        minAcc = Math.max(minAcc, l.minWidth)
      }
    }

    return { minWidth: minAcc + totalGap + chrome, width: widthAcc + totalGap + chrome }
  }

  async #layoutChildren(innerWidth: number, ctx: RenderCtx): Promise<string[]> {
    const children = layoutNodes(this.children)
    if (children.length === 0) return []
    const gap = this.state.gap ?? 0
    return (this.state.flexDirection ?? "column") === "row"
      ? this.#layoutRow(children, innerWidth, ctx, gap)
      : this.#layoutColumn(children, innerWidth, ctx, gap)
  }

  /**
   * Row direction — main axis is horizontal. CSS-style flex:
   * each child sizes to its intrinsic content width unless it claims
   * slack via `flexGrow > 0` or `width: "fill"`. Slack distributes by
   * grow weights; deficit distributes by `basis * flexShrink` clamped
   * at each child's `min-content` floor.
   *
   * Sizing strategy per child:
   *   1. `node.layout(ctx)` — sync, content-derived. If implemented,
   *      use directly; no render needed for measurement.
   *   2. Otherwise fall back to render-at-innerWidth and measure the
   *      widest emitted row. Cached; the paint pass reuses the result
   *      whenever the allocated width matches the measurement width.
   *
   * In `fit` mode the parent has no slack to give, so the allocator's
   * available is capped at the natural sum.
   */
  async #layoutRow(
    children: readonly Node[],
    innerWidth: number,
    ctx: RenderCtx,
    gap: number
  ): Promise<string[]> {
    // Phase 1: figure out each child's intrinsic size.
    // - `layout()` short-circuits — sync, no render.
    // - Fallback: render at the upper bound (innerWidth or fixed spec)
    //   and measure rows.
    const intrinsics = children.map((c) => c.getLayout(ctx))
    // For children with intrinsic sizing, skip the measure render
    // entirely. Others fall back to render-at-upper-bound (their fixed
    // width, or innerWidth if fluid).
    const measureWidths = children.map((c, i) => {
      if (intrinsics[i] !== undefined) return -1
      if (isFixedWidth(c.state.width)) {
        return resolveSize(c.state.width, innerWidth) ?? innerWidth
      }
      return innerWidth
    })
    const measureRows = await Promise.all(
      children.map((c, i): Promise<string[] | undefined> => {
        if (measureWidths[i] === -1) return Promise.resolve(undefined)
        return c.render({ ...ctx, width: measureWidths[i] })
      })
    )
    const naturals = children.map((_, i) => {
      const intr = intrinsics[i]
      if (intr) return intr.width
      return (measureRows[i] ?? []).reduce((m, r) => Math.max(m, stringWidth(r)), 0)
    })
    const items: RowItem[] = children.map((c, i) => {
      const s = c.state
      return {
        flexGrow: s.flexGrow,
        flexShrink: s.flexShrink,
        intrinsicMin: intrinsics[i]?.minWidth,
        maxWidth: s.maxWidth,
        minWidth: s.minWidth,
        natural: naturals[i],
        width: s.width,
      }
    })
    const allocAvailable =
      this.state.width === "fit"
        ? naturals.reduce((a, b) => a + b, 0) + gap * Math.max(0, children.length - 1)
        : innerWidth
    const widths = allocateRow(items, { contentWidth: allocAvailable, gap })
    // Phase 2: paint at allocated widths. Reuse the measure-render when
    // the allocation matches; otherwise render fresh (cached).
    const childRows = await Promise.all(
      children.map((c, i): Promise<string[]> => {
        const cached = measureRows[i]
        if (cached !== undefined && widths[i] === measureWidths[i]) {
          return Promise.resolve(cached)
        }
        return c.render({ ...ctx, width: widths[i] })
      })
    )
    // `zipRow` expects rows to be exactly `widths[i]` wide. Children
    // that emit natural-width rows (text default, code default) get
    // padded here so the contract holds; over-wide rows get clipped.
    const padded = childRows.map((rows, i) => rows.map((row) => padRow(row, widths[i])))
    return zipRow(padded, { gap, widths })
  }

  /**
   * Column direction — main axis is vertical, cross axis horizontal.
   * Per CSS `align-items: stretch` (default), children with no
   * explicit `width` fill the cross axis. A child with a fixed `width`
   * (number / `Pct`) takes that width as its cross-axis size, with the
   * leftover padded as right slack (default `flex-start`). `min`/`max`
   * clamp the resolved width.
   *
   * In fit-mode (`width: "fit"`), the cross-axis target shrinks to the
   * widest child row instead of stretching to `innerWidth` — symmetric
   * to how row-direction caps allocator-available at the natural sum.
   */
  async #layoutColumn(
    children: readonly Node[],
    innerWidth: number,
    ctx: RenderCtx,
    gap: number
  ): Promise<string[]> {
    const widths = children.map((c) => {
      const s = c.state
      const fixed = isFixedWidth(s.width) ? resolveSize(s.width, innerWidth) : undefined
      const w = fixed ?? innerWidth
      return clamp(w, { available: innerWidth, max: s.maxWidth, min: s.minWidth })
    })
    const childRows = await Promise.all(
      children.map((c, i) => c.render({ ...ctx, width: widths[i] }))
    )
    const target =
      this.state.width === "fit"
        ? childRows.reduce((m, rows) => rows.reduce((mm, r) => Math.max(mm, stringWidth(r)), m), 0)
        : innerWidth
    // Pad each child's rows to the cross-axis target. For full-stretch
    // children this absorbs natural-row slack; for fixed-width
    // children it adds right-side slack (default `flex-start`
    // alignment). `stackColumn`'s contract requires uniform width.
    const padded = childRows.map((rows) => rows.map((row) => padRow(row, target)))
    return stackColumn(padded, { gap, width: target })
  }
}

type Child = Node | false | null | undefined

/**
 * Factory for `Box`. The style object is required (use `{}` if you don't
 * need any styling) — the previous style-less overload caused TS to fail
 * to discriminate between a Node child and an inferred-empty-state node
 * like `WidgetNode`. Pass `box({}, child1, child2)` for un-styled boxes.
 *
 * Falsy children (`false`, `null`, `undefined`) are filtered out, enabling
 * conditional JSX-like composition: `box({}, cond && child)`.
 */
export function box(style: State<BoxStyle>, ...children: Child[]): Box {
  const b = new Box(style)
  for (const c of children) if (c) b.add(c)
  return b
}

/**
 * Flatten fragment nodes (those that implement the `layoutChildren`
 * protocol — `show`, `errorBoundary`, `suspense`) into their currently
 * active leaves. Recursive: a fragment whose `layoutChildren()`
 * itself contains fragments unfolds completely.
 *
 * The fragment Node still lives in the tree (mounted, propagating
 * invalidates) — layout just sees through it so its children share
 * the parent box's flex distribution, gap, and cross-axis sizing
 * instead of collapsing into a single slot.
 */
function layoutNodes(children: readonly Node[]): readonly Node[] {
  return children.flatMap((c) => c.layoutNodes)
}

function resolvePadding(p: Padding | undefined): [t: number, r: number, b: number, l: number] {
  if (p === undefined) return [0, 0, 0, 0]
  if (typeof p === "number") return [p, p, p, p]
  if (p.length === 2) return [p[0], p[1], p[0], p[1]]
  return [p[0], p[1], p[2], p[3]]
}
