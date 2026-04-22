import type { StyleBuilder } from "../style/builder.ts"

import { sliceAnsi, stringWidth } from "../style/ansi.ts"

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

/** @internal */
export const borders = {
  double: { bl: "╚", br: "╝", h: "═", tl: "╔", tr: "╗", v: "║" },
  rounded: { bl: "╰", br: "╯", h: "─", tl: "╭", tr: "╮", v: "│" },
  single: { bl: "└", br: "┘", h: "─", tl: "┌", tr: "┐", v: "│" },
} as const satisfies Record<string, BorderChars>

/** Resolve the `border` style value to a concrete BorderChars, or undefined.
 *
 * @internal*/
export function resolveBorder(spec: BorderSpec | undefined): BorderChars | undefined {
  if (spec === undefined || spec === false) return undefined
  if (spec === true) return borders.single
  if (typeof spec === "string") return borders[spec]
  return spec
}

export type TitleAlign = "left" | "center" | "right"

export interface DrawBorderOpts {
  /**
   * Optional title embedded in the top border, with a single-cell space on
   * each side. Ellipsis-truncated when it overflows the budget.
   */
  title?: string
  /** Placement of `title` along the top border. Defaults to `"left"`. */
  titleAlign?: TitleAlign
  /**
   * Styled wrapper applied to the border glyphs (corners, horizontal,
   * vertical). Use `ctx.style.add(slotOrStyle)` at the call site so the
   * theme is resolved once per render.
   */
  borderStyle?: StyleBuilder
  /** Styled wrapper applied to the title text (including the padding spaces). */
  titleStyle?: StyleBuilder
}

/** Pass-through wrapper used when no style is supplied. */
const identity = (s: string): string => s

/**
 * Wrap pre-rendered inner rows with a border, adding top/bottom border rows
 * and left/right border chars to each inner row. Inner rows must be padded
 * to a uniform width; the output rows are `innerWidth + 2` wide.
 *
 * Border glyphs and the optional title can be styled independently via
 * `borderStyle` / `titleStyle` — each is a pre-bound `StyleBuilder`, so
 * this helper stays purely about geometry and never touches SGR itself.
 *
 * @internal
 */
export function drawBorder(
  rows: readonly string[],
  chars: BorderChars,
  opts: DrawBorderOpts = {}
): string[] {
  const { title, titleAlign } = opts
  const inner = rows.length > 0 ? stringWidth(rows[0]) : 0
  const wrapB = opts.borderStyle ?? identity
  const wrapT = opts.titleStyle ?? identity

  const out: string[] = []
  out.push(topRow({ align: titleAlign ?? "left", chars, inner, title, wrapB, wrapT }))
  const v = wrapB(chars.v)
  for (const row of rows) out.push(v + row + v)
  out.push(wrapB(chars.bl + chars.h.repeat(inner) + chars.br))
  return out
}

interface TopRowArgs {
  align: TitleAlign
  chars: BorderChars
  inner: number
  title: string | undefined
  wrapB: (s: string) => string
  wrapT: (s: string) => string
}

function topRow({ align, chars, inner, title, wrapB, wrapT }: TopRowArgs): string {
  if (title === undefined || title === "") {
    return wrapB(chars.tl + chars.h.repeat(inner) + chars.tr)
  }
  // Chrome: h + space + title + space + h (4 cells of chrome around the title)
  const budget = inner - 4
  if (budget <= 0) return wrapB(chars.tl + chars.h.repeat(inner) + chars.tr)
  const shown = truncate(title, budget)
  const totalH = inner - 2 - stringWidth(shown)
  const { leading, trailing } = distributeH(totalH, align)
  const prefix = wrapB(`${chars.tl}${chars.h.repeat(leading)}`)
  const titleSeg = wrapT(` ${shown} `)
  const suffix = wrapB(`${chars.h.repeat(trailing)}${chars.tr}`)
  return prefix + titleSeg + suffix
}

function distributeH(totalH: number, align: TitleAlign): { leading: number; trailing: number } {
  if (align === "left") return { leading: 1, trailing: totalH - 1 }
  if (align === "right") return { leading: totalH - 1, trailing: 1 }
  // center: leading rounds down so odd slack biases the title slightly left.
  const leading = Math.floor(totalH / 2)
  return { leading, trailing: totalH - leading }
}

function truncate(s: string, width: number): string {
  if (stringWidth(s) <= width) return s
  if (width <= 1) return "…".repeat(width)
  return `${sliceAnsi(s, 0, width - 1)}…`
}
