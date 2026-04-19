import type { Theme } from "./theme.ts"
import type { Color } from "./color.ts"

import { sliceAnsi, stringWidth } from "#runtime"
import { extractApc } from "./apc.ts"
import { colorParams } from "./color.ts"

export const RESET = "\x1b[0m"

// OSC 8 hyperlink sequence. ESC + backslash is the "string terminator" (ST)
// that closes the OSC. Format: `ESC]8;;URL ST TEXT ESC]8;; ST`.
const OSC8 = "\x1b]8;;"
const ST = "\x1b\\"

/**
 * Wrap `text` in an OSC 8 hyperlink pointing at `url`. Modern terminals
 * (iTerm2, kitty, WezTerm, VS Code, Ghostty, …) render the text as
 * clickable while falling back gracefully to plain text elsewhere.
 *
 * Safe to nest ANSI SGR styling inside the `text` argument — OSC 8 is a
 * separate escape category and doesn't conflict.
 *
 * An empty `url` short-circuits and returns `text` unchanged, so callers
 * can unconditionally pipe link text through this helper.
 */
export function hyperlink(url: string, text: string): string {
  if (url === "") return text
  return `${OSC8}${url}${ST}${text}${OSC8}${ST}`
}

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
  // Extract APC escapes (zero width, positional) per line up-front so
  // the join+re-slice step below doesn't smear them across every row.
  // sliceAnsi's own extractApc would otherwise grab every APC from
  // `joined` and prepend the lot to each slice — catastrophic for kitty
  // placements, which then fire on every row instead of just their own.
  const perLine = lines.map((line) => extractApc(line))
  const joinedNoApc = perLine.map((p) => p.rest).join("")
  const out: string[] = []
  let pos = 0
  for (const { apc, rest } of perLine) {
    const w = stringWidth(rest)
    // `joinedNoApc` has no APC content, so sliceAnsi's internal
    // extractApc here produces an empty `apc` prefix — the returned
    // slice is pure SGR-normalised content. We prepend the line's own
    // APCs back on.
    out.push(apc + sliceAnsi(joinedNoApc, pos, pos + w))
    pos += w
  }
  return out
}
