// oxlint-disable unicorn/consistent-function-scoping
import type { Style } from "./ansi.ts"
import type { Step } from "./oklch.ts"
import type { Theme } from "./theme.ts"

import { steps as COLOR_STEPS, variant } from "./oklch.ts"

export type RGB = [r: number, g: number, b: number]

/** Tonal-scale step as a string literal (e.g. `"300"`). Used to form
 *  variant suffixes in Color values: `primary-300`, `#82aaff-900`. */
export type ColorStep = `${Step}`

/** Alpha percentage for `/<alpha>` suffix on Color values. Any integer
 *  0..100 is accepted at runtime; the template literal uses `${number}`
 *  so odd values like `/98` typecheck without a cast. */
export type ColorAlpha = `${number}`

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

/** Hex color string. Matches `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`
 *  (any case; runtime validates). Alpha is native to the hex form, so
 *  there is no separate `/<alpha>` suffix for hex. */
export type HexColor = `#${string}`
export type ThemeKey = keyof Theme

/**
 * A color value. Accepted forms:
 *  - `#rgb` / `#rrggbb` hex
 *  - ANSI color names (`red`, `cyan`, `gray`, …)
 *  - Bright ANSI variants (`brightRed`, `brightBlue`, …)
 *  - Theme slot keys from `keyof Theme` (`primary`, `muted`, …)
 *  - `'inherit'` — use the parent's color (renders as no escape).
 *  - Variant suffix `-<step>` on hex or theme slots — e.g. `primary-300`,
 *    `#82aaff-900`. The base color gets resolved through the theme
 *    (extracting the channel when needed), then `variant(base, step)`
 *    shifts it along the OKLCH tonal scale.
 */
export type Color =
  | HexColor
  | AnsiColorName
  | BrightAnsiColorName
  | ThemeKey
  | "inherit"
  | `${HexColor | ThemeKey}-${ColorStep}`
  | `${ThemeKey}/${ColorAlpha}`
// The combined `slot-<step>/<alpha>` form works at runtime but the TS
// union for `ThemeKey × ColorStep × ColorAlpha` overflows the checker.
// Use an explicit `as Color` cast on literals that need both.

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
 * When the slot holds a Style object, `kind` picks which of its channels
 * to extract (`"fg"` → the Style's `fg`, `"bg"` → its `bg`). Passing
 * `kind: undefined` on a Style slot throws — Style-valued slots can't be
 * used as a single color without explicit channel selection.
 */
/**
 * Resolve a color value — including `-<step>` variants — to a literal
 * color string (hex, ANSI name, or still-unresolved if the input wasn't
 * a slot). Splits `foo-300` into base + step, resolves the base through
 * the theme (honouring `kind` for Style slots), then applies
 * `variant(hex, step)`. Non-variant inputs fall straight through to
 * `resolveThemeColor`.
 */
export function resolveColor(c: string, theme: Theme | undefined, kind?: "fg" | "bg"): string {
  let input = c
  // 1. Strip `/<alpha>` suffix (theme-slot forms only; hex alpha is
  //    embedded in the hex byte string).
  let alpha: number | undefined
  const slash = input.lastIndexOf("/")
  if (slash > 0) {
    const pct = Number(input.slice(slash + 1))
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
      alpha = pct / 100
      input = input.slice(0, slash)
    }
  }

  // 2. Strip `-<step>` suffix → apply tonal variant to the resolved base.
  let base: string
  const dash = input.lastIndexOf("-")
  if (dash > 0 && STEP_SET.has(Number(input.slice(dash + 1)))) {
    const step = Number(input.slice(dash + 1)) as Step
    const resolvedBase = resolveThemeColor(input.slice(0, dash), theme, kind)
    base = /^#[0-9a-fA-F]{3,8}$/.test(resolvedBase) ? variant(resolvedBase, step) : resolvedBase
  } else {
    base = resolveThemeColor(input, theme, kind)
  }

  // 3. If the base carries a native hex alpha channel (`#rgba` / `#rrggbbaa`),
  //    fold it into the pending alpha and rewrite `base` to its opaque hex.
  if (base.startsWith("#")) {
    const split = splitHexAlpha(base)
    if (split !== undefined) {
      base = split.hex
      if (split.a < 1) alpha = (alpha ?? 1) * split.a
    }
  }

  // 4. Pre-composite with `theme.bg` when alpha < 1. Terminals don't
  //    support real alpha, so we blend to an opaque color at resolve
  //    time. When bg can't be resolved to hex (ansi / inherit / missing),
  //    drop alpha silently — same no-op as `-<step>` on ANSI themes.
  if (alpha !== undefined && alpha < 1 && base.startsWith("#") && theme !== undefined) {
    const bgHex = resolveThemeColor("bg", theme)
    if (bgHex.startsWith("#")) return blend(base, bgHex, alpha)
  }
  // When alpha is present but we can't blend, drop it silently if it was for bg
  if (alpha !== undefined && !base.startsWith("#") && kind === "bg") {
    return "inherit"
  }
  return base
}

const STEP_SET = new Set<number>(COLOR_STEPS)

/** Split a hex with optional alpha into an opaque hex + alpha ∈ [0,1].
 *  Returns undefined if input doesn't carry alpha so callers can keep
 *  going through the existing hex paths. */
function splitHexAlpha(hex: string): { hex: string; a: number } | undefined {
  const body = hex.slice(1)
  if (body.length === 4) {
    // #rgba — nibble alpha (0xA → 0xAA → /255).
    const a = nibble(body[3])
    if (a === undefined) return undefined
    return { a: (a * 17) / 255, hex: `#${body.slice(0, 3)}` }
  }
  if (body.length === 8) {
    const a = byte(body.slice(6, 8))
    if (a === undefined) return undefined
    return { a: a / 255, hex: `#${body.slice(0, 6)}` }
  }
  return undefined
}

/** Linear-sRGB blend of two opaque hex colors. `alpha` is the weight of
 *  `fgHex`; the rest comes from `bgHex`. Returns an opaque 6-digit hex. */
function blend(fgHex: string, bgHex: string, alpha: number): string {
  const fg = parseHex(fgHex)
  const bg = parseHex(bgHex)
  if (fg === undefined || bg === undefined) return fgHex
  const lin = (c: number): number => {
    const u = c / 255
    return u <= 0.040_45 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4
  }
  const srgb = (c: number): number => {
    const v = c <= 0.003_130_8 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055
    return Math.max(0, Math.min(255, Math.round(v * 255)))
  }
  const mix = (a: number, b: number): number => srgb(alpha * lin(a) + (1 - alpha) * lin(b))
  const r = mix(fg[0], bg[0])
  const g = mix(fg[1], bg[1])
  const b = mix(fg[2], bg[2])
  const h = (n: number): string => n.toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

/**
 * Walk `ref` through theme slot aliases until it lands on a Style object,
 * a non-slot string (ANSI name / hex / unknown), or loops back on itself.
 * Shared by `resolveThemeColor` and `resolveStyle` — both want the same
 * "follow the chain" behaviour, they just care about different terminals.
 */
function walkSlot(ref: string, theme: Theme | undefined): string | Style {
  if (theme === undefined) return ref
  const t = theme as Record<string, string | Style | undefined>
  const seen = new Set<string>()
  let cur = ref
  for (;;) {
    if (seen.has(cur)) return cur
    seen.add(cur)
    const v = t[cur]
    if (v === undefined) return cur
    if (typeof v === "object") return v
    cur = v
  }
}

/**
 * Resolve a style-slot reference into a `Style` object. A ref is either a
 * theme slot name (string), an inline `Style`, or `undefined`:
 *
 *  - Inline `Style` → returned as-is (no slot lookup).
 *  - String ref pointing at a **Color** slot → wrapped as `{ fg: <color> }`.
 *  - String ref pointing at a **Style** slot → returned directly.
 *  - String ref that doesn't match a slot → treated as a fg color
 *    (`{ fg: <ref> }`) and resolved downstream by `colorParams`.
 *  - `undefined` → `{}` (emits nothing).
 */
export function resolveStyle(ref: string | Style | undefined, theme?: Theme): Style {
  if (ref === undefined) return {}
  if (typeof ref === "object") return ref
  const v = walkSlot(ref, theme)
  return typeof v === "string" ? { fg: v as Color } : v
}

/**
 * Resolve a theme-named color slot to a literal color string. Inputs
 * that don't match a slot pass through unchanged so callers can keep
 * classifying downstream.
 *
 * When the slot walks to a Style object, `kind` picks which of its
 * channels to extract (`"fg"` → Style.fg, `"bg"` → Style.bg). Without
 * `kind`, a Style slot throws — Style-valued slots can't be used as a
 * single color without explicit channel selection.
 */
export function resolveThemeColor(c: string, theme: Theme | undefined, kind?: "fg" | "bg"): string {
  const v = walkSlot(c, theme)
  if (typeof v === "string") return v
  if (kind !== undefined) {
    const channel = (v as Record<string, unknown>)[kind]
    if (typeof channel === "string") {
      // Channel value may itself be a slot ref; walk again.
      return resolveThemeColor(channel, theme)
    }
    throw new TypeError(`Theme slot "${c}" is a Style without a ${kind} color.`)
  }
  throw new TypeError(
    `Theme slot "${c}" is a Style, not a Color — use it via *Style fields (e.g. borderStyle), not fg/bg.`
  )
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
  const resolved = resolveColor(color, theme, kind)

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
  // Alpha channel (4/8-char forms) is stripped upstream by `splitHexAlpha`
  // so colorParams always sees an opaque form. Still accept 4/8 here for
  // robustness on direct callers — alpha byte is ignored.
  const hex = input.slice(1)
  if (hex.length === 3 || hex.length === 4) {
    const r = nibble(hex[0])
    const g = nibble(hex[1])
    const b = nibble(hex[2])
    if (r === undefined || g === undefined || b === undefined) return undefined
    return [r * 17, g * 17, b * 17]
  }
  if (hex.length === 6 || hex.length === 8) {
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
