import type { Size } from "./size.ts"

import { splitAnsi, stringWidth, wrapAnsi, sliceAnsi, RESET } from "../style/ansi.ts"
import { resolveSize } from "./size.ts"

export type WrapMode = "word" | "char" | "none"

export type FormatText = {
  wrap?: WrapMode
  width?: Size
  available: number
}

export function formatText(text: string, opts: FormatText): string[] {
  const mode = opts.wrap ?? "word"
  const size = resolveSize(opts.width, opts.available)
  const wrapBudget = Math.min(opts.available, size ?? opts.available)
  const rows = splitAnsi(mode === "none" ? text : wrapAnsi(text, wrapBudget, { mode }))
  return size !== undefined ? rows.map((row) => padOrClip(row, wrapBudget)) : rows
}

/**
 * Pad a row with spaces on the right, or clip it to exactly `width`
 * cells. Handles ANSI-styled rows correctly:
 *
 *  - Styled rows get a `RESET` inserted before the pad spaces so the
 *    pad doesn't inherit the row's open SGR state.
 *  - Plain rows skip the `RESET` so output stays byte-identical to the
 *    no-style path — useful for layout tests that compare raw bytes.
 *  - Over-width rows are sliced via `sliceAnsi`, preserving SGR state.
 *
 * Used by every layout primitive that stitches rows together at a
 * fixed column count (column stack, row zip, Box body, Text output).
 */
function padOrClip(row: string, width: number): string {
  const w = stringWidth(row)
  if (w === width) return row
  if (w < width) {
    const tail = row.includes("\x1b[") ? RESET : ""
    return row + tail + " ".repeat(width - w)
  }
  return sliceAnsi(row, 0, width)
}
