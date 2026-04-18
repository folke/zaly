import { sliceAnsi, stringWidth } from "#runtime"

/**
 * Border-character glyphs for drawing a box outline. Any single-cell string
 * is allowed (including multi-byte glyphs like rounded corners).
 */
export interface BorderChars {
  h: string
  v: string
  tl: string
  tr: string
  bl: string
  br: string
}

export type BorderSpec = boolean | "single" | "double" | "rounded" | BorderChars

export const borders = {
  double: { bl: "╚", br: "╝", h: "═", tl: "╔", tr: "╗", v: "║" },
  rounded: { bl: "╰", br: "╯", h: "─", tl: "╭", tr: "╮", v: "│" },
  single: { bl: "└", br: "┘", h: "─", tl: "┌", tr: "┐", v: "│" },
} as const satisfies Record<string, BorderChars>

/** Resolve the `border` style value to a concrete BorderChars, or undefined. */
export function resolveBorder(spec: BorderSpec | undefined): BorderChars | undefined {
  if (spec === undefined || spec === false) return undefined
  if (spec === true) return borders.single
  if (typeof spec === "string") return borders[spec]
  return spec
}

/**
 * Wrap pre-rendered inner rows with a border, adding top/bottom border rows
 * and left/right border chars to each inner row. Inner rows must be padded
 * to a uniform width; the output rows are `innerWidth + 2` wide.
 *
 * An optional `title` is embedded in the top border, left-aligned with a
 * single-cell space around it. If the title overflows, it's ellipsis-truncated
 * to fit.
 */
export function drawBorder(rows: readonly string[], chars: BorderChars, title?: string): string[] {
  const inner = rows.length > 0 ? stringWidth(rows[0]) : 0
  const out: string[] = []
  out.push(topRow(chars, inner, title))
  for (const row of rows) out.push(chars.v + row + chars.v)
  out.push(chars.bl + chars.h.repeat(inner) + chars.br)
  return out
}

function topRow(chars: BorderChars, inner: number, title: string | undefined): string {
  if (title === undefined || title === "") {
    return chars.tl + chars.h.repeat(inner) + chars.tr
  }
  // Chrome: h + space + title + space + h (4 cells of chrome around the title)
  const budget = inner - 4
  if (budget <= 0) return chars.tl + chars.h.repeat(inner) + chars.tr
  const shown = truncate(title, budget)
  const trailing = inner - 4 - stringWidth(shown)
  return `${chars.tl}${chars.h} ${shown} ${chars.h.repeat(1 + trailing)}${chars.tr}`
}

function truncate(s: string, width: number): string {
  if (stringWidth(s) <= width) return s
  if (width <= 1) return "…".repeat(width)
  return `${sliceAnsi(s, 0, width - 1)}…`
}
