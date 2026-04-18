import type { Color } from "../style/color.ts"

import { moon } from "./tokyonight.ts"

/**
 * A theme is a flat record mapping semantic color slots to `Color` values.
 * Callers reference slots by key (`fg: "primary"`) and the framework resolves
 * through the theme at render time.
 *
 * Themes are identified by their module export name (e.g. `moon` exported
 * from `themes/tokyonight.ts`); no `name` field is stored on the object.
 * Use `loadTheme("tokyonight-moon")` for dynamic, name-based loading.
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

/**
 * Dynamically load a theme by name. The name is split on `-` into a module
 * name and an optional variant:
 *
 *  - `"tokyonight-moon"` → import `./tokyonight.ts` and pick `moon`
 *  - `"ansi"`            → import `./ansi.ts` and pick the `ansi` export
 *  - `"tokyonight"`      → import `./tokyonight.ts` and pick the `default` export
 *
 * Resolution order: `mod[variant]`, then `mod[modName]`, then `mod.default`.
 */
export async function loadTheme(name = "tokyonight-moon"): Promise<Theme> {
  const [modName, variant] = name.split("-", 2)
  const mod = (await import(`./${modName}.ts`)) as Record<string, Theme | undefined>
  const theme = mod[variant] ?? mod[modName] ?? mod.default
  if (theme === undefined) throw new Error(`Theme "${name}" not found in module "${modName}"`)
  return theme
}

export const defaultTheme = moon
