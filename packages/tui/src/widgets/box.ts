import type { RenderCtx, StyleState } from "../core/ctx.ts"
import type { BorderSpec, TitleAlign } from "../layout/border.ts"
import type { Flexible } from "../layout/flex.ts"
import type { RowItem } from "../layout/row.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/ansi.ts"

import { Node, isNode } from "../core/node.ts"
import { drawBorder, resolveBorder } from "../layout/border.ts"
import { stackColumn } from "../layout/column.ts"
import { allocateRow, zipRow } from "../layout/row.ts"
import { clamp, resolveSize } from "../layout/size.ts"
import { sliceAnsi, stringWidth } from "../style/ansi.ts"

export type Padding =
  | number
  | readonly [v: number, h: number]
  | readonly [t: number, r: number, b: number, l: number]

export interface BoxStyle extends StyleState, Flexible {
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

    const requested = resolveSize(style.width ?? "fill", ctx.width) ?? ctx.width
    const outer = clamp(requested, {
      available: ctx.width,
      max: style.maxWidth,
      min: style.minWidth,
    })

    const [padT, padR, padB, padL] = resolvePadding(style.padding)
    const bchars = resolveBorder(style.border)
    const hasBorder = bchars !== undefined

    const paddedWidth = Math.max(0, outer - (hasBorder ? 2 : 0))
    const inner = Math.max(0, paddedWidth - padL - padR)

    // Layout children into rows at inner width.
    let contentRows = await this.#layoutChildren(inner, ctx)

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

  async #layoutChildren(innerWidth: number, ctx: RenderCtx): Promise<string[]> {
    const children = this.children
    if (children.length === 0) return []
    const gap = this.state.gap ?? 0
    const dir = this.state.flexDirection ?? "column"

    if (dir === "column") {
      const childRows = await Promise.all(
        children.map((c) => c.render({ ...ctx, width: innerWidth }))
      )
      return stackColumn(childRows, { gap, width: innerWidth })
    }

    const items: RowItem[] = children.map((c) => {
      const s = c.state as Flexible
      return { flexGrow: s.flexGrow, maxWidth: s.maxWidth, minWidth: s.minWidth, width: s.width }
    })
    const widths = allocateRow(items, { contentWidth: innerWidth, gap })
    const childRows = await Promise.all(
      children.map((c, i) => c.render({ ...ctx, width: widths[i] }))
    )
    return zipRow(childRows, { gap, widths })
  }
}

type Child = Node | false | null | undefined

/**
 * Factory for `Box`. First-arg overloads:
 *  - `box(style, ...children)` — style object + children
 *  - `box(...children)` — style-less, children only
 *
 * Falsy children (`false`, `null`, `undefined`) are filtered out, enabling
 * conditional JSX-like composition: `box(cond && child)`.
 */
export function box(style: BoxStyle, ...children: Child[]): Box
export function box(...children: Child[]): Box
export function box(first?: BoxStyle | Child, ...rest: Child[]): Box {
  let style: BoxStyle
  let children: Child[]
  if (
    first !== undefined &&
    first !== null &&
    first !== false &&
    typeof first === "object" &&
    !isNode(first)
  ) {
    style = first
    children = rest
  } else {
    style = {}
    children = first === undefined ? rest : [first, ...rest]
  }
  const b = new Box(style)
  for (const c of children) if (c) b.add(c)
  return b
}

function resolvePadding(p: Padding | undefined): [t: number, r: number, b: number, l: number] {
  if (p === undefined) return [0, 0, 0, 0]
  if (typeof p === "number") return [p, p, p, p]
  if (p.length === 2) return [p[0], p[1], p[0], p[1]]
  return [p[0], p[1], p[2], p[3]]
}

/** Pad/clip a child row without injecting a RESET. The Box's outer
 *  `reapplyStyle` wrap inserts its own `RESET + reopen` at each inner
 *  `[0m`, so padding produced here stays inside the ambient style the
 *  box is closing over. Text's `padOrClip` in `style/ansi.ts` behaves
 *  differently — it inserts `RESET` before the pad — because Text has
 *  no outer reapply chain to carry the style forward. */
function padRow(row: string, width: number): string {
  const w = stringWidth(row)
  if (w === width) return row
  if (w < width) return row + " ".repeat(width - w)
  return sliceAnsi(row, 0, width)
}
