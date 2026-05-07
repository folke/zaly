import type { AnsiColor, AnsiStyle } from "./types.ts"

import { _sliceAnsi, _stringWidth, _wrapAnsi } from "#ansi"
import { isHexColor, parseHex } from "./color.ts"

/** Optional wrap mode: `"word"` (default) breaks at word boundaries;
 *  `"char"` hard-wraps mid-word. */
export interface WrapOpts {
  mode?: "word" | "char"
}

// ---- ANSI escape categories -------------------------------------------
const OSC_RE = /\x1b\][\s\S]*?(?:\x1b\\|\x07)/g
const CSI_RE = /\x1b\[[\d;?]*[a-zA-Z]/g
const APC_RE = /\u001B_[\s\S]*?\u001B\\/g
/** @internal */
export const RESET = "\x1b[0m"
// OSC 8 hyperlink sequence. ESC + backslash is the "string terminator" (ST)
// that closes the OSC. Format: `ESC]8;;URL ST TEXT ESC]8;; ST`.
const OSC8 = "\x1b]8;;"
const ST = "\x1b\\"

// Attribute → SGR code. Order matters for stable output.
const ATTRS = [
  ["bold", 1],
  ["dim", 2],
  ["italic", 3],
  ["underline", 4],
  ["inverse", 7],
  ["strikethrough", 9],
] as const satisfies readonly (readonly [keyof AnsiStyle, number])[]

// Standard 8-color ANSI palette. Offsets from SGR 30 (fg) and 40 (bg).
const ANSI_OFFSET: Record<string, number> = {
  black: 0,
  blue: 4,
  cyan: 6,
  green: 2,
  magenta: 5,
  red: 1,
  white: 7,
  yellow: 3,
}

const notFound = Symbol("not found")
const colorCache = new Map<string, string | typeof notFound>()

// ---- APC-aware text primitives ----------------------------------------
//
// APC (Application Program Command) escapes — `ESC _ ... ESC \` — are
// side-channel payloads the terminal consumes silently (e.g. the Kitty
// graphics protocol image transmits and placements). They have zero
// visible width and must survive layout operations without being
// truncated. The runtime shims below hand over to the Bun/Node
// primitives with APCs extracted first and re-prepended after.

function extractApc(s: string): { apc: string; rest: string } {
  if (!s.includes("\u001B_")) return { apc: "", rest: s }
  let apc = ""
  const rest = s.replace(APC_RE, (m) => {
    apc += m
    return ""
  })
  return { apc, rest }
}

/** Terminal display width in cells. APC escapes are excluded before
 *  measuring. */
export function stringWidth(s: string): number {
  return _stringWidth(extractApc(s).rest)
}

/** Strip terminal control sequences from `s`, leaving plain text.
 *  Removes:
 *    - SGR / CSI: `ESC [ ... <letter>` (color, cursor moves, etc.)
 *    - OSC: `ESC ] ... ST` or `ESC ] ... BEL` (hyperlinks, titles)
 *    - APC: `ESC _ ... ST` (KGP image transmits / placements)
 *
 *  Useful for emptiness checks, plain-text logging, and any context
 *  where decorative ANSI mustn't influence the result. */
export function stripAnsi(s: string): string {
  return s.replace(APC_RE, "").replace(OSC_RE, "").replace(CSI_RE, "")
}

/** Cell-aware substring preserving SGR state. APC escapes are re-
 *  prepended to the slice output so they stay attached to the row. */
export function sliceAnsi(s: string, start: number, end?: number): string {
  const { apc, rest } = extractApc(s)
  return apc + _sliceAnsi(rest, start, end)
}

/** Word- or char-wrap to `width` cells while preserving SGR state and
 *  APC escapes. Wraps line-by-line so APCs (zero-width, positional —
 *  e.g. kitty image placements) stay on their source line. A single
 *  global extract+prepend would collapse every APC onto row 0 of the
 *  output, and downstream `splitAnsi` would then re-prepend those to
 *  every row; the image placement would fire on every painted row. */
export function wrapAnsi(s: string, width: number, opts?: WrapOpts): string {
  const char = opts?.mode === "char"
  return s
    .split("\n")
    .map((line) => {
      const { apc, rest } = extractApc(line)
      return apc + _wrapAnsi(rest, width, { hard: true, trim: false, wordWrap: !char })
    })
    .join("\n")
}

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
 *
 * @internal
 */
export function hyperlink(url: string, text: string): string {
  if (url === "") return text
  return `${OSC8}${url}${ST}${text}${OSC8}${ST}`
}

export function ansiColor(color: AnsiColor, kind: "fg" | "bg"): string | undefined {
  const key = `${color}-${kind}`
  let cached = colorCache.get(key)
  if (cached === undefined) colorCache.set(key, (cached = _ansiColor(color, kind)) ?? notFound)
  return cached === notFound ? undefined : cached
}

function _ansiColor(color: AnsiColor, kind: "fg" | "bg"): string | undefined {
  if (color === "inherit") return
  // Gray aliases to brightBlack.
  if (color === "gray" || color === "grey") return String(kind === "fg" ? 90 : 100)

  const base = color in ANSI_OFFSET ? color : undefined
  if (base !== undefined) return String((kind === "fg" ? 30 : 40) + ANSI_OFFSET[base])

  if (color.startsWith("bright")) {
    const rest = color.slice("bright".length).toLowerCase()
    if (rest in ANSI_OFFSET) return String((kind === "fg" ? 90 : 100) + ANSI_OFFSET[rest])
  }

  const rgb = isHexColor(color) ? parseHex(color) : undefined
  if (rgb) {
    const indicator = kind === "fg" ? 38 : 48
    return `${indicator};2;${rgb[0]};${rgb[1]};${rgb[2]}`
  }
}

export function openAnsi(style: AnsiStyle) {
  const params: (number | string | undefined)[] = []
  for (const [key, code] of ATTRS) if (style[key]) params.push(code)
  if (style.fg !== undefined) params.push(ansiColor(style.fg, "fg"))
  if (style.bg !== undefined) params.push(ansiColor(style.bg, "bg"))
  const attrs = params.filter((p) => p !== undefined)
  if (attrs.length === 0) return ""
  return `\x1b[${attrs.join(";")}m`
}

/**
 * Post-process a styled string so an outer style is re-applied after any
 * inner full-reset (`\x1b[0m`). Without this, a child's reset clobbers
 * the parent's bg/fg/attrs for the remainder of the line.
 *
 * `escape` is the already-built SGR run to re-emit after each reset
 * (typically the return value of `openStyle(parentStyle, theme)`). If
 * empty, the input is returned unchanged.
 *
 * Inlined indexOf loop rather than `String.prototype.replaceAll` — the
 * manual version avoids the regex/object allocation overhead of
 * `replaceAll` and runs meaningfully faster on short strings (hot in
 * the builder's `apply`, called once per styled span). Pattern taken
 * from ansis's nested-style resolver.
 *
 * @internal
 */
export function reapplyStyle(s: string, escape: string): string {
  if (escape === "" || !s.includes(RESET)) return s
  const replacement = RESET + escape
  const searchLength = RESET.length
  let result = ""
  let lastPos = 0
  let pos = s.indexOf(RESET)
  while (pos !== -1) {
    result += s.slice(lastPos, pos) + replacement
    lastPos = pos + searchLength
    pos = s.indexOf(RESET, lastPos)
  }
  return result + s.slice(lastPos)
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

/** Check if the string contains any ANSI SGR escapes */
export function hasAnsi(text: string): boolean {
  return /\x1b\[[0-9;]*m/.test(text)
}

export const truncateAnsi = (s: string, maxLength: number, ellipsis = "…"): string => {
  const len = stringWidth(s)
  if (len <= maxLength) return s
  const ellipsisWidth = stringWidth(ellipsis)
  return `${sliceAnsi(s, 0, maxLength - ellipsisWidth)}${ellipsis}`
}
