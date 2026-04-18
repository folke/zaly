import type { Theme } from "./ctx.ts"

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
 *  - Theme slot keys from `Theme['colors']` (`primary`, `muted`, …)
 *  - `'inherit'` — use the parent's color (renders as no escape).
 */
export type Color =
  | HexColor
  | AnsiColorName
  | BrightAnsiColorName
  | keyof Theme["colors"]
  | "inherit"

/** Percentage string like `'50%'`, resolved against the parent's content axis. */
export type Pct = `${number}%`

/**
 * Size along one axis.
 *  - `number` — absolute cells
 *  - `Pct` — percentage of the parent's content axis
 *  - `'auto'` — natural size of the content
 *  - `'fill'` — fill the remaining space in the flex allocation
 */
export type Size = number | Pct | "auto" | "fill"

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

/** Minimum event map every node carries. */
export type BaseEvents = {
  invalidate: []
  mount: []
  unmount: []
}
