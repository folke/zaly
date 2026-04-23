import type { ThemeName } from "../themes/index.ts"
import type { Style } from "./ansi.ts"
import type { Color } from "./color.ts"
import type { ShikiTheme } from "./shiki.ts"

import { readFileSync, statSync } from "node:fs"
import { resolve } from "node:path"
import moonJson from "../../assets/themes/tokyonight-moon.json" with { type: "json" }
import { themes } from "../themes/index.ts"

/**
 * A theme slot value. Color shortcuts expand to `{ fg: <color> }` at resolve
 * time; Style objects are used as-is and may carry attrs (`bold`, `underline`,
 * etc.) and a `bg`. Use Color for simple fg-only slots; escalate to Style when
 * the part needs more than just a foreground color.
 */
export type ThemeValue = Color | Style

export type BuiltinTheme = ThemeName | "ansi"

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

/** Fill defaults on a raw theme object. Exposed for the generated
 *  `src/themes/*.ts` entries — apps should use `loadTheme()` or the
 *  per-name subpath exports instead.
 *
 *  Does *not* validate: built-in theme JSON is dev-controlled and
 *  exercised by the test suite, so we don't pay typia's ~3MB of
 *  generated assertions at startup. User-supplied JSON goes through
 *  `loadThemeFile`, which dynamically imports `validateTheme`.
 * @internal */
export function resolveTheme(theme: unknown): Theme {
  const { $schema: _, ...rest } = theme as Partial<Theme> & { $schema?: unknown }
  return { ...defaults, ...rest }
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

/**
 * Load a theme by name. Searches `opts.dirs` in order, then the built-in
 * dir; first `.json` match wins. The loaded JSON is validated against the
 * generated `Theme` schema and throws on any structural problem.
 */
export async function loadTheme(
  // `string & {}` (rather than bare `string`) preserves editor
  // autocomplete for the literal members of `BuiltinTheme` while
  // still accepting any string — TS folds `"x" | string` to `string`,
  // but `"x" | (string & {})` keeps the union branches visible.
  name: BuiltinTheme | (string & {}) = "tokyonight-moon",
  opts?: { dirs?: string[] }
): Promise<Theme> {
  if (name === "ansi") return { ...defaults }
  const files = (opts?.dirs ?? []).map((dir) => resolve(dir, `${name}.json`))
  for (const path of files) if (isFile(path)) return loadThemeFile(path)

  const builtin = (themes as Partial<typeof themes>)[name as ThemeName]
  if (builtin) return await builtin()

  throw new Error(
    `Theme "${name}" not found. Searched:\n${files.map((p) => `  - ${p}`).join("\n")}`
  )
}

/**
 * Load a theme directly from a file path. No directory search happens —
 * this is the escape hatch for CLIs that accept an explicit `--theme
 * /path/to/theme.json` argument.
 *
 * Async because typia's generated `validateTheme` (a few thousand
 * unrolled assertions) is dynamically imported here — it's only needed
 * for user-supplied JSON and should stay off the main startup path.
 */
export async function loadThemeFile(path: string): Promise<Theme> {
  const raw = tryWithError(() => readFileSync(path, "utf8"), `Failed to read theme file at ${path}`)
  const data = tryWithError(() => JSON.parse(raw), `Failed to parse theme JSON at ${path}`)
  const { validateTheme } = await import("../schemas/index.ts")
  return resolveTheme(validateTheme(data))
}

/** TokyoNight Moon — the default. Sourced from `assets/themes/tokyonight-moon.json`. */
export const defaultTheme = resolveTheme(moonJson)
