import type { Theme } from "./theme.ts"
import type { Color } from "./color.ts"

import { sliceAnsi, stringWidth } from "#runtime"
import { colorParams } from "./color.ts"

export const RESET = "\x1b[0m"

/** Base style shared by every node type. Box/Text/etc. extend this. */
export interface Style {
  fg?: Color
  bg?: Color
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strikethrough?: boolean
}

// Attribute → SGR code. Order matters for stable output.
const ATTRS = [
  ["bold", 1],
  ["dim", 2],
  ["italic", 3],
  ["underline", 4],
  ["inverse", 7],
  ["strikethrough", 9],
] as const satisfies readonly (readonly [keyof Style, number])[]

/**
 * Build the opening SGR escape for a style descriptor. Returns '' if nothing
 * would be emitted. Unresolvable colors (invalid or 'inherit') are dropped.
 *
 * When `theme` is provided, `fg`/`bg` values matching a theme color slot
 * (e.g. `"primary"`, `"muted"`) are resolved against it first. The output
 * ordering is attrs → fg → bg, combined into a single `\x1b[...m` run.
 */
export function openStyle(style: Style, theme?: Theme): string {
  const params: (number | string)[] = []

  for (const [key, code] of ATTRS) {
    if (style[key]) params.push(code)
  }

  if (style.fg !== undefined) {
    const p = colorParams(style.fg, "fg", theme)
    if (p !== undefined) params.push(p)
  }

  if (style.bg !== undefined) {
    const p = colorParams(style.bg, "bg", theme)
    if (p !== undefined) params.push(p)
  }

  if (params.length === 0) return ""
  return `\x1b[${params.join(";")}m`
}

/**
 * Split a multi-line ANSI string into per-line strings where each line is
 * **self-contained**: any SGR state active at the end of a line is closed
 * before the break, and re-opened at the start of the next line.
 *
 * Matches `String.prototype.split("\n")` semantics for plain strings, and
 * matches `wrap-ansi`'s close/re-open behavior for styled content — so pad /
 * clip / concat operations on the returned rows never inherit a dangling
 * style from a span that crossed the break.
 *
 * Works by re-slicing each line out of the newline-stripped source via
 * `sliceAnsi`, which tracks SGR state and emits the right close/open
 * sequences at cut points.
 */
export function splitAnsi(s: string): string[] {
  if (!s.includes("\n")) return [s]
  const lines = s.split("\n")
  // Shortcut: no escapes anywhere → plain split is fine.
  if (!s.includes("\x1b[")) return lines
  const joined = s.replaceAll("\n", "")
  const out: string[] = []
  let pos = 0
  for (const line of lines) {
    const w = stringWidth(line)
    out.push(sliceAnsi(joined, pos, pos + w))
    pos += w
  }
  return out
}
