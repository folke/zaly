import type { Theme } from "../core/ctx.ts"

/**
 * Palette-driven theme using only ANSI color names. Every slot renders via a
 * 30-/40-series or 90-/100-series SGR code, so the user's terminal theme
 * picks the actual hue — no hex/truecolor escapes are emitted for slot
 * references. `fg` and `bg` are `'inherit'` so the terminal's default
 * foreground/background surface through.
 */
export const ansi: Theme = {
  colors: {
    accent: "magenta",
    bg: "inherit",
    dim: "brightBlack",
    err: "red",
    fg: "inherit",
    muted: "brightBlack",
    ok: "green",
    primary: "blue",
    warn: "yellow",
  },
  name: "ansi",
}
