import type { Theme } from "./index.ts"

/**
 * Palette-driven theme using only ANSI color names. Every slot renders via a
 * 30-/40-series or 90-/100-series SGR code, so the user's terminal theme
 * picks the actual hue — no truecolor escapes are emitted. `fg` and `bg`
 * are `'inherit'` so the terminal's defaults surface through.
 */
export const ansi: Theme = {
  accent: "magenta",
  bg: "inherit",
  dim: "brightBlack",
  err: "red",
  fg: "inherit",
  muted: "brightBlack",
  ok: "green",
  primary: "blue",
  warn: "yellow",
}
