import { _sliceAnsi, _stringWidth, _wrapAnsi } from "#ansi"

/** Optional wrap mode: `"word"` (default) breaks at word boundaries;
 *  `"char"` hard-wraps mid-word. */
export interface WrapOpts {
  mode?: "word" | "char"
}

// ---- ANSI escape categories -------------------------------------------
export const OSC_RE = /\x1b\][\s\S]*?(?:\x1b\\|\x07)/g
export const CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g
export const APC_RE = /\x1b_[\s\S]*?\x1b\\/g
export const RESET = "\x1b[0m"

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

/** Strip terminal control sequences from `s`.
 *
 *  Default: removes all ANSI categories — APC, OSC, and CSI — leaving
 *  plain text suitable for emptiness checks, logging, or any context
 *  where decorative escapes mustn't influence the result.
 *
 *  With `keepStyles: true`: preserves SGR (color/style) sequences while
 *  still removing OSC, APC, and non-SGR CSI (cursor moves, erases,
 *  scroll, mode flips). Use this when displaying *external* output
 *  inside a TUI that wants to render colors but mustn't let the source
 *  control TUI cursor / clipboard / screen state. */
export function stripAnsi(s: string, opts: { keepStyles?: boolean } = {}): string {
  s = s.replace(APC_RE, "").replace(OSC_RE, "")
  return opts.keepStyles
    ? s.replace(CSI_RE, (match) => (match.endsWith("m") ? match : ""))
    : s.replace(CSI_RE, "")
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

export const truncateAnsi = (s: string, width: number, ellipsis = "…"): string => {
  const len = stringWidth(s)
  if (len <= width) return s
  const ellipsisWidth = stringWidth(ellipsis)
  return `${sliceAnsi(s, 0, width - ellipsisWidth)}${ellipsis}`
}

export const fitAnsi = (s: string, width: number, ellipsis = "…"): string => {
  const len = stringWidth(s)
  if (len === width) return s
  if (len < width) return s + " ".repeat(width - len)
  return truncateAnsi(s, width, ellipsis)
}
