import type { HexColor } from "../src/style/types.ts"
import type { TerminalPalette } from "../src/themes/system.ts"

import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { parseArgs } from "node:util"
import { themeFromPalette } from "../src/themes/system.ts"

export interface SchemeColor {
  /** Integer in [0, 255]. */
  r: number
  /** Integer in [0, 255]. */
  g: number
  /** Integer in [0, 255]. */
  b: number

  /** Six lowercase hex digits, without "#", e.g. "262427". */
  hex: string

  /** Slash-separated hex bytes, e.g. "26/24/27". */
  hexshell: `${string}/${string}/${string}`

  /** Comma-separated RGB channels, e.g. "38,36,39". */
  rgb: `${number},${number},${number}`
}

export type AnsiIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15

export type RequiredColorKey =
  | `Ansi ${AnsiIndex} Color`
  | "Background Color"
  | "Bold Color"
  | "Cursor Color"
  | "Cursor Guide Color"
  | "Cursor Text Color"
  | "Foreground Color"
  | "Selected Text Color"
  | "Selection Color"

export type OptionalColorKey =
  | "Active Pane Border Color"
  | "Badge Color"
  | "IME Cursor Color"
  | "Link Color"
  | "Match Background Color"
  | "Tab Color"
  | "Underline Color"

export type Appearance = "Dark" | "Light"

// These two colors have no appearance-specific overrides in the file.
export type AppearanceColorKey = `${Exclude<
  RequiredColorKey | OptionalColorKey,
  "Active Pane Border Color" | "IME Cursor Color"
>} (${Appearance})`

export type SchemeColors = Record<RequiredColorKey, SchemeColor> &
  Partial<Record<OptionalColorKey | AppearanceColorKey, SchemeColor>>

export interface Scheme {
  scheme_name: string
  colors: SchemeColors
  Dark_Theme?: boolean
  author?: string
}

const INPUT_FILE = resolve(import.meta.dirname, "../../../../iTerm2-Color-Schemes/schemes.jsonl")
const PREVIEW_THEMES = [
  "TokyoNight Moon",
  "TokyoNight Day",
  "Catppuccin Mocha",
  "Catppuccin Latte",
  "GitHub Dark",
  "GitHub",
  "Nord",
  "Gruvbox Dark",
  "Gruvbox Light",
]

export function paletteFromScheme(scheme: Scheme, appearance?: Appearance): TerminalPalette {
  function hex(key: RequiredColorKey | OptionalColorKey): HexColor | undefined {
    const override = appearance ? (`${key} (${appearance})` as AppearanceColorKey) : undefined
    const value = (override ? scheme.colors[override] : undefined) ?? scheme.colors[key]
    if (!value) return
    if (!/^[0-9a-f]{6}$/i.test(value.hex)) throw new Error(`${scheme.scheme_name}: invalid ${key}`)
    return `#${value.hex.toLowerCase()}`
  }
  function required(key: RequiredColorKey): HexColor {
    const value = hex(key)
    if (!value) throw new Error(`${scheme.scheme_name}: missing ${key}`)
    return value
  }
  let paletteAppearance: TerminalPalette["appearance"]
  if (!appearance && scheme.Dark_Theme !== undefined)
    paletteAppearance = scheme.Dark_Theme ? "dark" : "light"
  return {
    ansi: Array.from({ length: 16 }, (_, i) => required(`Ansi ${i as AnsiIndex} Color`)),
    bg: required("Background Color"),
    fg: required("Foreground Color"),
    appearance: paletteAppearance,
    selectionBg: hex("Selection Color"),
    selectionFg: hex("Selected Text Color"),
  }
}

function main() {
  const { values } = parseArgs({
    options: {
      input: { type: "string", default: INPUT_FILE },
      output: { type: "string", default: resolve(import.meta.dirname, "../assets/themes/iterm2") },
      theme: { type: "string", multiple: true },
      all: { type: "boolean", default: false },
      appearance: { type: "string" },
    },
  })
  const appearance = values.appearance
  if (appearance !== undefined && appearance !== "Dark" && appearance !== "Light") {
    throw new Error("--appearance must be Dark or Light")
  }
  if (values.all && values.theme?.length) throw new Error("Use --all or --theme, not both")
  const input = readFileSync(values.input, "utf8")
  const schemes = input
    .split("\n")
    .filter((line) => line.trim())
    .map((line, i) => {
      try {
        return JSON.parse(line) as Scheme
      } catch (error) {
        throw new Error(`Invalid scheme JSON at line ${i + 1}`, { cause: error })
      }
    })
  const names = values.all ? schemes.map((s) => s.scheme_name) : (values.theme ?? PREVIEW_THEMES)
  const outputs = new Map<string, { text: string; name: string; author?: string }>()
  for (const name of names) {
    const scheme = schemes.find((s) => s.scheme_name === name)
    if (!scheme) throw new Error(`Scheme not found: ${name}`)
    const id = name
      .toLowerCase()
      .replaceAll("+", "-plus")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    if (!id || outputs.has(id)) throw new Error(`Duplicate or invalid scheme id: ${name}`)
    const theme = {
      $schema:
        "https://raw.githubusercontent.com/folke/zaly/main/packages/tui/assets/schemas/theme.schema.json",
      id,
      name,
      ...themeFromPalette(paletteFromScheme(scheme, appearance)),
    }
    outputs.set(id, {
      text: `${JSON.stringify(theme, undefined, 2)}\n`,
      name,
      author: scheme.author,
    })
  }
  mkdirSync(values.output, { recursive: true })
  for (const [id, output] of [...outputs].toSorted(([a], [b]) => a.localeCompare(b))) {
    writeFileSync(resolve(values.output, `${id}.json`), output.text)
    console.log(`✔ ${id}.json`)
  }
  copyFileSync(resolve(dirname(values.input), "LICENSE"), resolve(values.output, "LICENSE"))
  const credits = [...outputs]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([, s]) => `- ${s.name}${s.author ? ` — ${s.author}` : ""}`)
  writeFileSync(
    resolve(values.output, "README.md"),
    [
      "# iTerm2 palette previews",
      "",
      "Generated manually by `packages/tui/scripts/themes-iterm2.ts` from the local `schemes.jsonl`.",
      "These previews do not replace or register the existing built-in themes.",
      "",
      "Source: https://github.com/mbadolato/iTerm2-Color-Schemes",
      `Source JSONL SHA-256: ${createHash("sha256").update(input).digest("hex")}`,
      "",
      "Regenerate: `bun packages/tui/scripts/themes-iterm2.ts` from the repository root.",
      "Use `--input <jsonl>`, `--output <directory>`, repeated `--theme <name>`, or `--all` to customize the import.",
      "Use `--appearance Dark|Light` to apply appearance-specific color overrides where provided.",
      'Preview with `loadTheme({ path: "packages/tui/assets/themes/iterm2/tokyonight-moon.json" })`.',
      "Or run `zaly --theme ./packages/tui/assets/themes/iterm2/tokyonight-day.json` from the repository root.",
      "Leave `ui.shiki` set to `auto` to generate syntax highlighting from each imported palette.",
      "",
      "The collection is MIT licensed; individual themes retain their authors’ licenses.",
      "See [LICENSE](./LICENSE) and the upstream [credits](https://github.com/mbadolato/iTerm2-Color-Schemes/blob/master/CREDITS.md).",
      "Generated palettes are not a change of license.",
      "",
      ...credits,
      "",
    ].join("\n")
  )
}

if (import.meta.main) main()
