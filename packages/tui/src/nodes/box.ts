import type { RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { BaseEvents, Size, Style } from "../core/types.ts"
import type { BorderSpec } from "../layout/border.ts"
import type { RowItem } from "../layout/row.ts"

import { sliceAnsi, stringWidth } from "#runtime"
import { NodeBase } from "../core/node.ts"
import { drawBorder, resolveBorder } from "../layout/border.ts"
import { stackColumn } from "../layout/column.ts"
import { allocateRow, zipRow } from "../layout/row.ts"
import { clamp, resolveSize } from "../layout/size.ts"
import { openStyle, RESET } from "../style/ansi.ts"
import { reapplyBg } from "../style/compose.ts"

export type Padding =
  | number
  | readonly [v: number, h: number]
  | readonly [t: number, r: number, b: number, l: number]

export interface BoxStyle extends Style {
  flexDirection?: "row" | "column"
  gap?: number
  flexGrow?: number
  width?: Size
  height?: Size
  minWidth?: Size
  maxWidth?: Size
  minHeight?: Size
  maxHeight?: Size
  padding?: Padding
  border?: BorderSpec
  borderTitle?: string
}

export type BoxEvents = BaseEvents & {
  childadded: [child: Node]
  childremoved: [child: Node]
}

export class Box extends NodeBase<BoxStyle, BoxEvents> {
  readonly #children: Node[] = []

  get children(): readonly Node[] {
    return this.#children
  }

  add(child: Node): this {
    this.#children.push(child)
    child.parent = this
    this.invalidate()
    this.emit("childadded", child)
    return this
  }

  remove(child: Node): this {
    const i = this.#children.indexOf(child)
    if (i === -1) return this
    this.#children.splice(i, 1)
    if (child.parent === this) child.parent = undefined
    this.invalidate()
    this.emit("childremoved", child)
    return this
  }

  clear(): this {
    const removed = [...this.#children]
    this.#children.length = 0
    for (const c of removed) {
      if (c.parent === this) c.parent = undefined
      this.emit("childremoved", c)
    }
    this.invalidate()
    return this
  }

  protected _render(ctx: RenderCtx): string[] {
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
    let contentRows = this.#layoutChildren(inner, ctx)

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

    if (bchars) rows = drawBorder(rows, bchars, style.borderTitle)

    const open = openStyle(style, ctx.theme)
    const bgOnly = style.bg === undefined ? "" : openStyle({ bg: style.bg }, ctx.theme)
    if (bgOnly !== "") {
      rows = rows.map((row) => open + reapplyBg(row, bgOnly) + RESET)
    } else if (open !== "") {
      rows = rows.map((row) => open + row + RESET)
    }

    return rows
  }

  #layoutChildren(innerWidth: number, ctx: RenderCtx): string[] {
    if (this.#children.length === 0) return []
    const gap = this.state.gap ?? 0
    const dir = this.state.flexDirection ?? "column"

    if (dir === "column") {
      const childRows = this.#children.map((c) => c.render({ ...ctx, width: innerWidth }))
      return stackColumn(childRows, { gap, width: innerWidth })
    }

    const items: RowItem[] = this.#children.map((c) => {
      const s = c.state as {
        width?: Size
        minWidth?: Size
        maxWidth?: Size
        flexGrow?: number
      }
      return { flexGrow: s.flexGrow, maxWidth: s.maxWidth, minWidth: s.minWidth, width: s.width }
    })
    const widths = allocateRow(items, { contentWidth: innerWidth, gap })
    const childRows = this.#children.map((c, i) => c.render({ ...ctx, width: widths[i] }))
    return zipRow(childRows, { gap, widths })
  }
}

function resolvePadding(p: Padding | undefined): [t: number, r: number, b: number, l: number] {
  if (p === undefined) return [0, 0, 0, 0]
  if (typeof p === "number") return [p, p, p, p]
  if (p.length === 2) return [p[0], p[1], p[0], p[1]]
  return [p[0], p[1], p[2], p[3]]
}

function padRow(row: string, width: number): string {
  const w = stringWidth(row)
  if (w === width) return row
  if (w < width) return row + " ".repeat(width - w)
  return sliceAnsi(row, 0, width)
}
