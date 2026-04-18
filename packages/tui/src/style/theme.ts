import type { Color } from "./color.ts"

/**
 * A theme is a flat record mapping semantic color slots to `Color` values.
 * Callers reference slots by key (`fg: "primary"`) and the framework resolves
 * through the theme at render time.
 *
 * The module export name (e.g. `tokyoNightMoon`) serves as the theme's
 * identifier; no `name` field is stored on the object.
 */
export type Theme = {
  fg: Color
  bg: Color
  muted: Color
  dim: Color
  primary: Color
  accent: Color
  ok: Color
  warn: Color
  err: Color
}
