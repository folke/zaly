import type { Simplify } from "@zaly/shared"
import type { Theme } from "../themes/types.ts"

export type RGB = [r: number, g: number, b: number]

/** Alpha percentage for `/<alpha>` suffix on Color values. Any integer
 *  0..100 is accepted at runtime; the template literal uses `${number}`
 *  so odd values like `/98` typecheck without a cast. */
export type ColorLightness = `${number}`

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
export type ThemeKey = Exclude<
  keyof Theme<false, unknown>,
  "shiki" | "$schema" | "id" | "name" | "appearance"
>

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
export type Color<Ansi extends boolean = true, I = true> =
  | HexColor
  | (Ansi extends true ? AnsiColorName : never)
  | (Ansi extends true ? BrightAnsiColorName : never)
  | ThemeKey
  | (I extends true ? "inherit" : never)
  | `${HexColor | ThemeKey}-${ColorLightness}`
  | `${HexColor | ThemeKey}+${ColorLightness}`

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
export type Style<Ansi extends boolean = true> = Simplify<
  Omit<AnsiStyle, "fg" | "bg"> & {
    fg?: Color<Ansi>
    bg?: Color<Ansi>
    style?: AnyStyle<Ansi>
  }
>

export type AnyStyle<Ansi extends boolean = false> = Style<Ansi> | Color<Ansi>
