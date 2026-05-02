// ---- ANSI escape categories -------------------------------------------
//
// CSI / OSC / APC are the three categories of multi-byte terminal escape
// sequences we care about. SGR (color/style) is a *subset* of CSI —
// distinguished by ending in `m` rather than any other final letter.

/** OSC: `ESC ] ... ST` or `ESC ] ... BEL` — window titles, hyperlinks
 *  (OSC 8), clipboard writes (OSC 52), color palette changes. */
const OSC_RE = /\x1b\][\s\S]*?(?:\x1b\\|\x07)/g
/** CSI: `ESC [ <params> <final>` — covers SGR (`m`), cursor moves
 *  (`H A B C D E F G s u`), erases (`J K`), insert/delete/scroll
 *  (`L M S T r`), and mode set/reset (`?...h`, `?...l`). */
const CSI_RE = /\x1b\[[\d;?]*[a-zA-Z]/g
/** APC: `ESC _ ... ESC \` — Kitty graphics protocol image transmits /
 *  placements and other side-channel payloads. */
const APC_RE = /_[\s\S]*?\\/g

/** C0 (`0x00–0x1F`) + DEL (`0x7F`) + C1 (`0x80–0x9F`), excluding `\t`,
 *  `\n`, `\r`. Includes ESC (`0x1B`). Use when no ANSI sequences are
 *  expected to survive into the cleaned output. */
const BINARY_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g
/** Same as `BINARY_RE` but excludes ESC (`0x1B`) — keeps the trigger
 *  byte for SGR sequences alive when they were preserved upstream. */
const BINARY_KEEP_ESC_RE = /[\x00-\x08\x0B\x0C\x0E-\x1A\x1C-\x1F\x7F-\x9F]/g

/** Zero-widths, BOM, bidi explicit-overrides, bidi isolates, and tag
 *  characters — all invisible or rendering-altering codepoints used as
 *  prompt-injection / trojan-source vectors. Stripping these breaks
 *  emoji ZWJ sequences (👨‍👩‍👧 → 👨👩👧), so opt in only for LLM-bound text. */
const ADVERSARIAL_RE = /[​-‍⁠﻿‪-‮⁦-⁩\u{E0000}-\u{E007F}]/gu

/** ESC bytes not followed by `[`, `]`, or `_` — i.e. not the start of
 *  any recognized CSI / OSC / APC sequence. Used to clean up stray
 *  ESCs that survive `stripAnsi(_, { keepStyles: true })`. */
const STRAY_ESC_RE = /\x1B(?![[\]_])/g

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

/** Strip adversarial Unicode codepoints — zero-widths, BOM, bidi
 *  controls, and tag characters. These are invisible or
 *  rendering-altering and are common vectors for prompt-injection /
 *  trojan-source attacks.
 *
 *  Note: this strips U+200D (ZWJ), which is the glue between codepoints
 *  in compound emoji like 👨‍👩‍👧. Don't apply blindly to user-typed text. */
export function stripAdversarial(s: string): string {
  return s.replace(ADVERSARIAL_RE, "")
}

/** Strip C0/C1 control bytes (NUL, BEL, BS, etc.) and DEL, while
 *  preserving `\t`, `\n`, `\r`.
 *
 *  Default: also strips ESC (`0x1B`). Use when ANSI sequences have
 *  already been removed (or were never present) and any remaining
 *  control bytes are noise.
 *
 *  With `keepStyles: true`: preserves ESC bytes that are part of SGR
 *  sequences left intact by `stripAnsi(_, { keepStyles: true })`. A
 *  follow-up pass also strips *stray* ESCs (those not followed by
 *  `[ ] _`) so the TUI renderer can't be confused by them. */
export function stripBinary(s: string, opts: { keepStyles?: boolean } = {}): string {
  s = s.replace(opts.keepStyles ? BINARY_KEEP_ESC_RE : BINARY_RE, "")
  return opts.keepStyles ? s.replace(STRAY_ESC_RE, "") : s
}

/** Normalize CR/LF/CRLF to LF. Lone `\r` becomes `\n` (treated as a
 *  newline rather than dropped, so progress-bar updates render as
 *  separate lines instead of running together). After this runs, the
 *  string contains no `\r` characters. */
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n?/g, "\n")
}

export type CleanTextOpts = {
  /** Preserve SGR (color/style) ANSI sequences instead of stripping
   *  them. Threaded through `stripAnsi` *and* `stripBinary` so that
   *  ESC bytes inside surviving SGRs are also kept. Default `false`
   *  (LLM-friendly). */
  keepStyles?: boolean
  /** Run `stripAnsi`. Default `true`. */
  ansi?: boolean
  /** Run `stripBinary`. Default `true`. */
  binary?: boolean
  /** Run `stripAdversarial`. Default `false` — opt in for LLM-bound
   *  text; leaving it off preserves emoji ZWJ. */
  adversarial?: boolean
  /** Run `normalizeNewlines`. Default `true`. */
  newlines?: boolean
  /** Apply `String.prototype.normalize("NFC")`. Default `true`. */
  unicode?: boolean
}

const cleanDefaults: Required<CleanTextOpts> = {
  adversarial: false,
  ansi: true,
  binary: true,
  keepStyles: false,
  newlines: true,
  unicode: true,
}

/** Clean text for safe display and processing.
 *
 *  Defaults to a conservative middle ground: strip ANSI sequences,
 *  binary control bytes, normalize newlines + Unicode (NFC). Drops
 *  SGR styles (LLM-friendly) and skips adversarial Unicode strip
 *  (preserves emoji ZWJ).
 *
 *  Order is fixed and load-bearing:
 *   1. `stripAnsi`         — consumes ESC bytes before binary strip would
 *   2. `normalizeNewlines` — so binary regex doesn't have to handle CR
 *   3. `stripBinary`       — remaining control bytes
 *   4. `normalize("NFC")`  — canonical form before adversarial match
 *   5. `stripAdversarial`  — match codepoints in canonical shape
 *
 *  For audience-specific behavior, prefer the presets:
 *    - `cleanTextTui(s)`   — preserves color/style sequences
 *    - `cleanTextAgent(s)` — strips adversarial Unicode for LLM input */
export function cleanText(s: string, opts: CleanTextOpts = {}): string {
  opts = { ...cleanDefaults, ...opts }
  if (opts.ansi) s = stripAnsi(s, { keepStyles: opts.keepStyles })
  if (opts.newlines) s = normalizeNewlines(s)
  if (opts.binary) s = stripBinary(s, { keepStyles: opts.keepStyles })
  if (opts.unicode) s = s.normalize("NFC")
  if (opts.adversarial) s = stripAdversarial(s)
  return s
}

/** TUI preset: preserve SGR color/style sequences while still removing
 *  cursor moves, OSC, APC, binary control bytes, etc. Use when the
 *  bytes are about to be displayed by a terminal that should render
 *  colors but mustn't be controlled by the source. */
export const cleanTextTui = (s: string) => cleanText(s, { keepStyles: true })

/** Agent (LLM) preset: full strip including adversarial Unicode (zero-
 *  widths, bidi controls, tag chars). Use on the way to a provider API. */
export const cleanTextAgent = (s: string) => cleanText(s, { adversarial: true, keepStyles: false })
