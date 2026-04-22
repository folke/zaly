import type { RenderCtx } from "../core/ctx.ts"
import type { StyleBuilder } from "../style/builder.ts"
import type { MdCallbacks } from "./types.ts"

import { stringWidth } from "../style/ansi.ts"

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
      const out = formatTable(state, style)
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

/**
 * Format the accumulated table state into a fully-bordered table:
 *
 *     ┌───────┬───────┐
 *     │ col a │ col b │
 *     ├───────┼───────┤
 *     │ one   │ two   │
 *     │ three │ four  │
 *     └───────┴───────┘
 *
 * Columns widen to the widest (ANSI-aware) cell; alignment comes from the
 * per-cell `align` meta. All border glyphs (corners, rules, column
 * separators) are styled via `mdTable`; header cells are pre-styled via
 * `mdTableHeader` at push time.
 */
function formatTable(state: TableState, style: StyleBuilder): string {
  const rows = [...state.header, ...state.body]
  if (rows.length === 0) return ""
  const nCols = Math.max(...rows.map((r) => r.length))
  const widths: number[] = Array.from({ length: nCols }, () => 0)
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i], stringWidth(row[i].text))
    }
  }

  // Pre-style each piece of chrome once. Each column span on a rule row is
  // `widths[i] + 2` dashes (one cell of padding on each side of the cell).
  const v = style.mdTable("│")
  const ruleRow = (left: string, mid: string, right: string): string =>
    style.mdTable(left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right)
  const top = ruleRow("┌", "┬", "┐")
  const sep = ruleRow("├", "┼", "┤")
  const bot = ruleRow("└", "┴", "┘")

  const renderRow = (row: TableCell[]): string => {
    const cells = row.map((cell, i) => padCell(cell.text, widths[i], cell.align))
    // Pad missing trailing cells (rare — ragged tables) so columns line up.
    for (let i = row.length; i < nCols; i++) cells.push(" ".repeat(widths[i]))
    return `${v} ${cells.join(` ${v} `)} ${v}`
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
