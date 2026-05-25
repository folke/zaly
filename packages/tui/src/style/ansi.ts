import type { AnsiColor, AnsiStyle } from "./types.ts"

import { sliceAnsi } from "@zaly/shared/ansi"
import { hasColors } from "@zaly/shared/env"
import { isHexColor, parseHex, toHex } from "./color.ts"

/** Optional wrap mode: `"word"` (default) breaks at word boundaries;
 *  `"char"` hard-wraps mid-word. */
export interface WrapOpts {
  mode?: "word" | "char"
}

// ---- ANSI escape categories -------------------------------------------
// OSC 8 hyperlink sequence. ESC + backslash is the "string terminator" (ST)
// that closes the OSC. Format: `ESC]8;;URL ST TEXT ESC]8;; ST`.
const OSC8 = "\x1b]8;;"
const ST = "\x1b\\"
export const RESET = "\x1b[0m"

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

const ANSI_BG: Record<number, AnsiColor> = {
  100: "gray", // or "brightBlack" if that exists
  101: "brightRed",
  102: "brightGreen",
  103: "brightYellow",
  104: "brightBlue",
  105: "brightMagenta",
  106: "brightCyan",
  107: "brightWhite",
  40: "black",
  41: "red",
  42: "green",
  43: "yellow",
  44: "blue",
  45: "magenta",
  46: "cyan",
  47: "white",
}

const notFound = Symbol("not found")
const colorCache = new Map<string, string | typeof notFound>()

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
  if (!hasColors) return
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
  if (!hasColors) return ""
  const params: (number | string | undefined)[] = []
  for (const [key, code] of ATTRS) if (style[key]) params.push(code)
  if (style.fg !== undefined) params.push(ansiColor(style.fg, "fg"))
  if (style.bg !== undefined) params.push(ansiColor(style.bg, "bg"))
  const attrs = params.filter((p) => p !== undefined)
  if (attrs.length === 0) return ""
  return `\x1b[${attrs.join(";")}m`
}

export function styleAnsi(text: string, style?: AnsiStyle): string {
  if (!style) return text
  const open = openAnsi(style)
  if (open === "") return text
  return `${open}${text}${RESET}`
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

export function ansiBg(str: string, idx: number): AnsiColor | undefined {
  const cell = sliceAnsi(str, idx, idx + 1)

  let bg: AnsiColor | undefined

  for (const match of cell.matchAll(/\x1b\[([0-9;]*)m/g)) {
    const params = match[1].split(";").map(Number)

    for (let i = 0; i < params.length; i++) {
      const p = params[i]

      if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) {
        bg = ANSI_BG[p]
      } else if (p === 48 && params[i + 1] === 2) {
        bg = toHex(params[i + 2], params[i + 3], params[i + 4])
        i += 4
      }
    }
  }

  return bg
}
