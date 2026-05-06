import type { Theme } from "../themes/index.ts"
import type { Step } from "./oklch.ts"

export type RGBA = {
  r: number
  g: number
  b: number
  a?: number
  hex: HexColor
}

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

export type AnsiColor = AnsiColorName | BrightAnsiColorName | HexColor | "inherit"

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

export interface AnsiStyle {
  fg?: AnsiColor
  bg?: AnsiColor
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strikethrough?: boolean
}

/** Base style shared by every node type. Box/Text/etc. extend this.
 *  Pure styling — no layout or lifecycle fields. Widget state interfaces
 *  extend `StyleState` to pick up the `visible` base-state bits alongside
 *  these style fields. */
export type Style = Omit<AnsiStyle, "fg" | "bg"> & {
  fg?: Color
  bg?: Color
  style?: AnyStyle
}

export type AnyStyle = Style | Color
