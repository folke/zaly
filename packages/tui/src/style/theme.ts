import type { Style } from "./ansi.ts"
import type { Color } from "./color.ts"
import type { ShikiTheme } from "./shiki.ts"

import { readFileSync, statSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import moonJson from "../../assets/themes/tokyonight-moon.json" with { type: "json" }
import { validateTheme } from "../schemas/index.ts"

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
  /** Optional name of a matching Shiki syntax-highlighting theme. Code
   *  blocks and fenced markdown snippets look this up so highlighting
   *  aligns with the TUI palette. Leave unset for themes without a
   *  Shiki counterpart. */
  shiki?: ShikiTheme
  fg: Color
  bg: Color
  primary: Color
  accent: Color
  dim: Color
  muted: Color

  success: Color
  info: Color
  warn: Color
  error: Color

  title: ThemeValue
  border: ThemeValue
  borderTitle: ThemeValue
  line: ThemeValue

  mdBold: ThemeValue
  mdItalic: ThemeValue
  mdStrikethrough: ThemeValue

  mdHeading: ThemeValue
  mdHeading1: ThemeValue
  mdHeading2: ThemeValue
  mdHeading3: ThemeValue
  mdHeading4: ThemeValue
  mdHeading5: ThemeValue
  mdHeading6: ThemeValue

  mdCode: ThemeValue
  mdCodeBlock: ThemeValue
  mdCodeBlockTitle: ThemeValue
  mdHr: ThemeValue
  mdLink: ThemeValue
  mdListBullet: ThemeValue
  mdListChecked: ThemeValue
  mdListUnchecked: ThemeValue
  mdQuote: ThemeValue
  mdTable: ThemeValue
  mdTableHeader: ThemeValue

  menuLabel: ThemeValue
  menuHint: ThemeValue
  menuActive: ThemeValue

  code: ThemeValue
  codeTitle: ThemeValue

  diffAdd: ThemeValue
  diffContext: ThemeValue
  diffDel: ThemeValue
  diffLine: ThemeValue
  diffTitle: ThemeValue
}

// oxlint-disable-next-line sort-keys
const defaults: Theme = {
  fg: "inherit",
  bg: "inherit",
  primary: "blue",
  accent: "brightMagenta",
  dim: "brightBlack",
  muted: "brightBlack",

  success: "green",
  info: "cyan",
  warn: "yellow",
  error: "red",

  title: { bold: true, fg: "primary" },
  border: "muted",
  borderTitle: "title",
  line: "muted",

  mdBold: { bold: true, fg: "fg" },
  mdItalic: { fg: "fg", italic: true },
  mdStrikethrough: { fg: "fg", strikethrough: true },

  mdHeading: "title",
  mdHeading1: "mdHeading",
  mdHeading2: { bold: true, fg: "accent" },
  mdHeading3: "mdHeading2",
  mdHeading4: "mdHeading2",
  mdHeading5: "mdHeading2",
  mdHeading6: "mdHeading2",

  mdCode: { bg: "primary/15", fg: "primary" },
  mdCodeBlock: { bg: "muted", fg: "primary" },
  mdCodeBlockTitle: "title",
  mdHr: "accent",
  mdLink: { fg: "primary", underline: true },
  mdListBullet: "accent",
  mdListChecked: "primary",
  mdListUnchecked: "primary",
  mdQuote: "dim",
  mdTable: "accent",
  mdTableHeader: "title",

  menuLabel: "primary",
  menuHint: "muted",
  menuActive: { bg: "muted" },

  code: { bg: "muted" },
  codeTitle: "title",

  diffAdd: { bg: "success/3", fg: "success" },
  diffContext: "dim",
  diffDel: { bg: "error/3", fg: "error" },
  diffTitle: "title",
  diffLine: "line",
}

function resolveTheme(theme: unknown): Theme {
  const ret = validateTheme(theme)
  delete ret.$schema
  return { ...defaults, ...ret }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function tryWithError<T>(fn: () => T, errorMsg: string): T {
  try {
    return fn()
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    throw new Error(`${errorMsg}: ${msg}`, { cause: error })
  }
}

function pkgPath(...parts: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (;;) {
    if (isFile(resolve(dir, "package.json"))) break
    const parent = dirname(dir)
    if (parent === dir) break // filesystem root; fall through with dir as-is
    dir = parent
  }
  return resolve(dir, ...parts)
}

/**
 * Built-in theme search directory. The CLI layer can opt-in additional
 * user-provided dirs via the `dirs` option on `loadTheme`.
 *
 * Path is derived by walking up from this module's location until we
 * find the package's `package.json`, then joining `assets/themes`. That
 * way we don't depend on the module being at a fixed depth — works when
 * `theme.ts` is loaded from `src/` (bun) or from `dist/` (node).
 * @internal
 */
export const builtinThemeDir = resolve(pkgPath(), "assets", "themes")

/**
 * Load a theme by name. Searches `opts.dirs` in order, then the built-in
 * dir; first `.json` match wins. The loaded JSON is validated against the
 * generated `Theme` schema and throws on any structural problem.
 */
export function loadTheme(name = "tokyonight-moon", opts?: { dirs?: string[] }): Theme {
  if (name === "ansi") return { ...defaults }
  const files = [...(opts?.dirs ?? []), builtinThemeDir].map((dir) => resolve(dir, `${name}.json`))
  for (const path of files) if (isFile(path)) return loadThemeFile(path)
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
  const raw = tryWithError(() => readFileSync(path, "utf8"), `Failed to read theme file at ${path}`)
  const data = tryWithError(() => JSON.parse(raw), `Failed to parse theme JSON at ${path}`)
  return resolveTheme(data)
}

/** TokyoNight Moon — the default. Sourced from `assets/themes/tokyonight-moon.json`. */
export const defaultTheme = resolveTheme(moonJson)
