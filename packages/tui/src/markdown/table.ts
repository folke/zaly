import type { RenderCtx } from "../core/ctx.ts"
import type { Layout } from "../core/state.ts"
import type { RowItem } from "../layout/flex.ts"
import type { MdCallbacks } from "./types.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { allocateRow } from "../layout/flex.ts"
import { calcLayout, formatText } from "../layout/text.ts"

type CellAlign = "left" | "center" | "right"

interface TableCell {
  text: string
  align: CellAlign | undefined
}

interface TableState {
  header: TableCell[][]
  body: TableCell[][]
  pending: TableCell[]
  pendingIsHeader: boolean
}

type TableCallbacks = Pick<MdCallbacks, "table" | "tbody" | "td" | "th" | "thead" | "tr">

/**
 * Build the table-related callbacks. They share a closure-local
 * `TableState` accumulator: `th`/`td` push cells, `tr` commits rows into
 * header or body, and `table` runs the final layout + reset. Tables can't
 * nest in markdown, so a single top-level slot is enough.
 */
export function createTableCallbacks(ctx: RenderCtx): TableCallbacks {
  const { style } = ctx
  let state: TableState | undefined
  const begin = (): TableState =>
    (state ??= { body: [], header: [], pending: [], pendingIsHeader: false })

  return {
    table: () => {
      // Children of th/td/tr/thead/tbody are empty strings; all content is
      // in `state`. Format, reset, emit.
      if (state === undefined) return ""
      const out = formatTable(state, ctx)
      state = undefined
      return `${out}\n\n`
    },

    tbody: () => "",

    td: (children, meta) => {
      const t = begin()
      t.pending.push({ align: meta?.align, text: children })
      t.pendingIsHeader = false
      return ""
    },

    th: (children, meta) => {
      const t = begin()
      t.pending.push({ align: meta?.align, text: style.mdTableHeader(children) })
      t.pendingIsHeader = true
      return ""
    },

    thead: () => "",

    tr: () => {
      if (state === undefined || state.pending.length === 0) return ""
      if (state.pendingIsHeader) state.header.push(state.pending)
      else state.body.push(state.pending)
      state.pending = []
      return ""
    },
  }
}

function formatTable(state: TableState, ctx: RenderCtx): string {
  const cols: Layout[] = []
  const cells = [...state.header, ...state.body]
  const colCount = Math.max(...cells.map((r) => r.length))

  // 1. Calculate min-content and max-content for each column
  for (let c = 0; c < colCount; c++) {
    for (const row of cells) {
      const cell = row[c] as TableCell | undefined
      if (!cell) continue // Safety guard for ragged rows
      const l = calcLayout(cell.text)
      cols[c] ??= { ...l }
      cols[c].width = Math.max(cols[c].width, l.width)
      cols[c].minWidth = Math.max(cols[c].minWidth, l.minWidth)
    }
  }
  const chromeWidth = 3 * colCount + 1

  const items: RowItem[] = cols.map((c) => ({
    flex: 1,
    intrinsicMin: c.minWidth,
    natural: c.width,
  }))

  const widths = allocateRow(items, { contentWidth: ctx.width - chromeWidth, gap: 0 })

  // 4. Render output string using the exact final Column Widths
  // Pre-style each piece of chrome once. Each column span on a rule row is
  // `widths[i] + 2` dashes (one cell of padding on each side of the cell).
  const style = ctx.style
  const v = style.mdTable("│")
  const ruleRow = (left: string, mid: string, right: string): string =>
    style.mdTable(left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right)
  const top = ruleRow("┌", "┬", "┐")
  const sep = ruleRow("├", "┼", "┤")
  const bot = ruleRow("└", "┴", "┘")

  const renderRow = (row: TableCell[]): string => {
    const formatted = row.map((cell, c) =>
      formatText(cell.text, { indent: false, width: widths[c], wrapBg: false })
    )
    const rows: string[] = []
    const rowCount = Math.max(...formatted.map((r) => r.length))
    for (let r = 0; r < rowCount; r++) {
      const line: string[] = []
      for (let c = 0; c < colCount; c++) {
        const t = formatted[c]?.[r] ?? ""
        line.push(padCell(t, widths[c], row[c]?.align))
      }
      rows.push(`${v} ${line.join(` ${v} `)} ${v}`)
    }

    return rows.join("\n")
  }

  const lines: string[] = [top]
  for (const row of state.header) lines.push(renderRow(row))
  if (state.header.length > 0 && state.body.length > 0) lines.push(sep)
  for (const row of state.body) lines.push(renderRow(row))
  lines.push(bot)
  return lines.join("\n")
}

function padCell(text: string, width: number, align: CellAlign | undefined): string {
  const slack = Math.max(0, width - stringWidth(text))
  if (align === "right") return " ".repeat(slack) + text
  if (align === "center") {
    const left = Math.floor(slack / 2)
    return " ".repeat(left) + text + " ".repeat(slack - left)
  }
  return text + " ".repeat(slack)
}
