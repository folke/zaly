// oxlint-disable typescript/unified-signatures
import type { BuiltinThemeName } from "./builtin.ts"
import type { Theme } from "./types.ts"

import { createRegistry, safeStat, withError } from "@zaly/shared"
import { readFileSync } from "node:fs"
import { resolve } from "pathe"
import moonJson from "../../assets/themes/tokyonight-moon.json" with { type: "json" }
import { builtin } from "./builtin.ts"
import { defaults } from "./default.ts"

export { defaults } from "./default.ts"
export type { Theme, ThemeValue } from "./types.ts"

/** Built-in theme names plus the synthetic `"ansi"` palette (no JSON
 *  — falls back to `defaults` only). */
export type BuiltinTheme = BuiltinThemeName | "ansi"
export type AnyTheme = BuiltinTheme | (string & {})

const DEFAULT_THEME: BuiltinTheme = "tokyonight-moon"

/**
 * Registry of built-in themes plus any registered at runtime. The
 * registry never awaits — `V = Promise<Theme>` so callers `await`
 * explicitly.
 */
export const themeRegistry = createRegistry<Promise<Partial<Theme>>>("theme").from(builtin)
themeRegistry.register("ansi", async () => defaults)

/**
 * Load a theme by name. Searches `opts.dirs` in order for `<name>.json`,
 * then falls back to the built-in registry. The `"ansi"` synthetic
 * theme returns just `defaults` (no palette).
 */
export async function loadTheme(name?: string): Promise<Theme>
export async function loadTheme(opts: { name: string; dirs?: string[] }): Promise<Theme>
export async function loadTheme(opts: { path: string }): Promise<Theme>
export async function loadTheme(
  o?: string | { name?: string; dirs?: string[]; path?: string }
): Promise<Theme> {
  o ??= DEFAULT_THEME
  const opts = typeof o === "string" ? { name: o } : o

  if (opts.name) {
    const files = (opts.dirs ?? []).map((dir) => resolve(dir, `${opts.name}.json`))
    const file = files.find((path) => safeStat(path)?.isFile())
    if (file) return loadThemeFile(file)
    if (themeRegistry.has(opts.name)) return resolveTheme(await themeRegistry.load(opts.name))
    throw new Error(
      `Theme "${opts.name}" not found. Searched:\n${files.map((p) => `  - ${p}`).join("\n")}`
    )
  }

  if (opts.path) return loadThemeFile(opts.path)
  throw new Error("No theme name or path provided")
}

/**
 * Fill defaults on a raw theme object. Built-in JSON is dev-controlled
 * so we don't pay typia's ~3MB of generated assertions at startup;
 * user-supplied JSON goes through `loadThemeFile` which validates.
 */
function resolveTheme(theme: unknown): Theme {
  const { $schema: _, ...rest } = theme as Partial<Theme> & { $schema?: unknown }
  return { ...defaults, ...rest }
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
async function loadThemeFile(path: string): Promise<Theme> {
  const raw = withError(() => readFileSync(path, "utf8"), `Failed to read theme file at ${path}`)
  const data = withError(() => JSON.parse(raw), `Failed to parse theme JSON at ${path}`)
  const { validateTheme } = await import("../schemas/index.ts")
  return resolveTheme(validateTheme(data))
}

/** TokyoNight Moon — the default. Sourced from `assets/themes/tokyonight-moon.json`. */
export const defaultTheme = resolveTheme(moonJson)
