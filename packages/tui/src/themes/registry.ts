import type { Theme } from "./types.ts"

import { withError } from "@zaly/shared"
import { createRegistry } from "@zaly/shared/registry"
import { readFileSync } from "node:fs"
import { basename } from "pathe"
import moonJson from "../../assets/themes/tokyonight-moon.json" with { type: "json" }
import { builtin } from "./builtin.ts"
import { defaults, ansi } from "./default.ts"

/** Built-in theme names plus the synthetic `"ansi"` palette (no JSON
 *  — falls back to `defaults` only). */
export type BuiltinTheme = keyof typeof builtin | "ansi"
export type AnyTheme = BuiltinTheme | (string & {})
export type ThemeLoader = () => Promise<Partial<Theme>>

const DEFAULT_THEME: BuiltinTheme = "tokyonight-moon"

/**
 * Registry of built-in themes plus any registered at runtime. The
 * registry never awaits — loaders return `Promise<Partial<Theme>>` so
 * callers `await` explicitly.
 */
export const themeRegistry = createRegistry<ThemeLoader>("theme").from(builtin)
// NOTE: remove the ansi theme for now, since it looks kinda broken and not really possible
// to fix properly
themeRegistry.register("ansi", async () => ({ ...ansi }))

/**
 * Load a theme by name or path.
 */
export async function loadTheme(name?: string): Promise<Theme>
export async function loadTheme(opts: { name?: string; path?: string }): Promise<Theme>
export async function loadTheme(o?: string | { name?: string; path?: string }): Promise<Theme> {
  o ??= DEFAULT_THEME
  const opts = typeof o === "string" ? { name: o } : o

  if (opts.name?.endsWith(".json")) return loadTheme({ path: opts.name })
  if (opts.path) return loadThemeFile(opts.path)
  if (opts.name) {
    if (opts.name === DEFAULT_THEME) return defaultTheme
    if (themeRegistry.has(opts.name))
      return resolveTheme(await themeRegistry.load(opts.name), opts.name)
    throw new Error(`Theme "${opts.name}" not found.`)
  }

  return defaultTheme
}

/**
 * Fill defaults on a raw theme object. Built-in JSON is dev-controlled
 * so we don't pay typia's ~3MB of generated assertions at startup;
 * user-supplied JSON goes through `loadThemeFile` which validates.
 */
function resolveTheme(theme: unknown, id: string): Theme {
  const { $schema: _, ...rest } = theme as Partial<Theme> & { $schema?: unknown }
  return { ...defaults, id, name: id, ...rest }
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
  const { validateTheme } = await import("../schemas/gen/theme.config.ts")
  return resolveTheme(validateTheme(data), basename(path, ".json"))
}

/** TokyoNight Moon — the default. Sourced from `assets/themes/tokyonight-moon.json`. */
export const defaultTheme = resolveTheme(moonJson, "tokyonight-moon")
