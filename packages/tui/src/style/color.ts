import type { Theme } from "./theme.ts"

export type RGB = [r: number, g: number, b: number]

/** Standard ANSI color names. */
export type AnsiColorName =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "grey"

/** Bright ANSI variants — `brightRed`, `brightBlue`, etc. */
export type BrightAnsiColorName = `bright${Capitalize<AnsiColorName>}`

/** Hex color string. Matches `#rgb` or `#rrggbb` (any case); runtime validates. */
export type HexColor = `#${string}`

/**
 * A color value. Accepted forms:
 *  - `#rgb` / `#rrggbb` hex
 *  - ANSI color names (`red`, `cyan`, `gray`, …)
 *  - Bright ANSI variants (`brightRed`, `brightBlue`, …)
 *  - Theme slot keys from `keyof Theme` (`primary`, `muted`, …)
 *  - `'inherit'` — use the parent's color (renders as no escape).
 */
export type Color = HexColor | AnsiColorName | BrightAnsiColorName | keyof Theme | "inherit"

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

/**
 * Resolve a theme-named color slot (e.g. `"primary"`) against a Theme.
 * Inputs that don't match a slot pass through unchanged so callers can keep
 * classifying downstream.
 *
 * Throws if the slot holds a Style object — Style-valued slots belong on
 * component part fields (e.g. `borderStyle`), not in fg/bg color channels.
 */
export function resolveThemeColor(c: string, theme: Theme | undefined): string {
  if (theme === undefined) return c
  const t = theme as Record<string, unknown>
  const v = t[c]
  if (v === undefined) return c
  if (typeof v !== "string") {
    throw new TypeError(
      `Theme slot "${c}" is a Style, not a Color — use it via *Style fields (e.g. borderStyle), not fg/bg.`
    )
  }
  return v
}

/**
 * Convert a color value to its SGR parameter string for either the fg or bg
 * slot. Returns undefined when the input is `'inherit'` or unresolvable —
 * caller treats that as "no color applied."
 *
 *   "red"       → "31" (fg) / "41" (bg)
 *   "brightRed" → "91" / "101"
 *   "gray" / "grey" → aliased to brightBlack
 *   "#82aaff"   → "38;2;130;170;255" / "48;2;130;170;255"
 *   theme slot  → resolved via `theme`, re-classified
 */
export function colorParams(color: string, kind: "fg" | "bg", theme?: Theme): string | undefined {
  if (color === "inherit") return undefined
  const resolved = resolveThemeColor(color, theme)

  // Gray aliases to brightBlack.
  if (resolved === "gray" || resolved === "grey") {
    return String(kind === "fg" ? 90 : 100)
  }

  const base = resolved in ANSI_OFFSET ? resolved : undefined
  if (base !== undefined) {
    return String((kind === "fg" ? 30 : 40) + ANSI_OFFSET[base])
  }

  if (resolved.startsWith("bright")) {
    const rest = decapitalize(resolved.slice("bright".length))
    if (rest in ANSI_OFFSET) {
      return String((kind === "fg" ? 90 : 100) + ANSI_OFFSET[rest])
    }
  }

  const rgb = parseHex(resolved)
  if (rgb) {
    const indicator = kind === "fg" ? 38 : 48
    return `${indicator};2;${rgb[0]};${rgb[1]};${rgb[2]}`
  }

  return undefined
}

function decapitalize(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1)
}

function parseHex(input: string): RGB | undefined {
  if (!input.startsWith("#")) return undefined
  const hex = input.slice(1)
  if (hex.length === 3) {
    const r = nibble(hex[0])
    const g = nibble(hex[1])
    const b = nibble(hex[2])
    if (r === undefined || g === undefined || b === undefined) return undefined
    return [r * 17, g * 17, b * 17]
  }
  if (hex.length === 6) {
    const r = byte(hex.slice(0, 2))
    const g = byte(hex.slice(2, 4))
    const b = byte(hex.slice(4, 6))
    if (r === undefined || g === undefined || b === undefined) return undefined
    return [r, g, b]
  }
  return undefined
}

function nibble(c: string): number | undefined {
  const n = Number.parseInt(c, 16)
  return Number.isNaN(n) ? undefined : n
}

function byte(s: string): number | undefined {
  if (!/^[0-9a-fA-F]{2}$/.test(s)) return undefined
  return Number.parseInt(s, 16)
}
