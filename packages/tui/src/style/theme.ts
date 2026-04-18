import type { Style } from "./ansi.ts"
import type { Color } from "./color.ts"

import { readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import moonJson from "../../assets/themes/tokyonight-moon.json" with { type: "json" }
import { validateTheme } from "../schemas/gen/theme.config.ts"

/**
 * A theme slot value. Color shortcuts expand to `{ fg: <color> }` at resolve
 * time; Style objects are used as-is and may carry attrs (`bold`, `underline`,
 * etc.) and a `bg`. Use Color for simple fg-only slots; escalate to Style when
 * the part needs more than just a foreground color.
 */
export type ThemeValue = Color | Style

/**
 * A theme is a flat record mapping semantic slots to `ThemeValue`s. Callers
 * reference slots by key (`fg: "primary"` for colors, `borderStyle: "border"`
 * for style refs) and the framework resolves through the theme at render time.
 *
 * Built-in themes live as JSON under `assets/themes/`. `moon` is bundled as
 * a static import for zero-cost default access; load any other theme by
 * name via `loadTheme("tokyonight-storm")`.
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
  border: ThemeValue
  borderTitle: ThemeValue
  /**
   * Fallback heading style applied when a specific `mdHeading{N}` slot is
   * not set on the theme. Always required so any heading level renders.
   */
  mdHeading: ThemeValue
  mdHeading1?: ThemeValue
  mdHeading2?: ThemeValue
  mdHeading3?: ThemeValue
  mdHeading4?: ThemeValue
  mdHeading5?: ThemeValue
  mdHeading6?: ThemeValue
  mdStrong: ThemeValue
  mdEmphasis: ThemeValue
  mdStrikethrough: ThemeValue
  mdCode: ThemeValue
  mdCodeBlock: ThemeValue
  mdCodeBlockTitle: ThemeValue
  mdLink: ThemeValue
  mdBlockquote: ThemeValue
  mdList: ThemeValue
  mdListChecked: ThemeValue
  mdListUnchecked: ThemeValue
  mdHr: ThemeValue
  mdTable: ThemeValue
  mdTableHeader: ThemeValue
}

/**
 * Built-in theme search directory. The CLI layer can opt-in additional
 * user-provided dirs via the `dirs` option on `loadTheme`.
 */
export const builtinThemeDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "assets",
  "themes"
)

/**
 * Load a theme by name. Searches `opts.dirs` in order, then the built-in
 * dir; first `.json` match wins. The loaded JSON is validated against the
 * generated `Theme` schema and throws on any structural problem.
 */
export function loadTheme(name = "tokyonight-moon", opts?: { dirs?: string[] }): Theme {
  const files = [...(opts?.dirs ?? []), builtinThemeDir].map((dir) => resolve(dir, `${name}.json`))
  for (const path of files) {
    try {
      if (statSync(path).isFile()) return loadThemeFile(path)
    } catch {}
  }
  throw new Error(
    `Theme "${name}" not found. Searched:\n${files.map((p) => `  - ${p}`).join("\n")}`
  )
}

/**
 * Load a theme directly from a file path. No directory search happens —
 * this is the escape hatch for CLIs that accept an explicit `--theme
 * /path/to/theme.json` argument.
 */
export function loadThemeFile(path: string): Theme {
  let raw: string | undefined
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    throw new Error(`Theme file not found at ${path}`)
  }
  return parseAndValidate(raw, path)
}

function parseAndValidate(raw: string, path: string): Theme {
  const data = JSON.parse(raw) as unknown
  // The packaged JSON has a `$schema` pointer for editor support; strip it
  // before validating so the equality check doesn't flag it as an extra.
  if (typeof data === "object" && data !== null && "$schema" in data) {
    delete (data as Record<string, unknown>).$schema
  }
  try {
    return validateTheme(data)
  } catch (error) {
    // typia's `createAssertEquals` throws a formatted error on the first
    // violation. Prepend the source path so the caller knows which file.
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`Theme at ${path} failed validation: ${msg}`, { cause: error })
  }
}

/** TokyoNight Moon — the default. Sourced from `assets/themes/tokyonight-moon.json`. */
export const moon = moonJson as Theme

export const defaultTheme = moon
