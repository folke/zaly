/**
 * Build `assets/themes/<id>.json` files from Shiki's bundled theme
 * data. Uses `shiki`'s `bundledThemes` map directly — each entry is a
 * lazy-import that returns the TextMate-style theme JSON.
 *
 * Invocation:
 *   bun scripts/build-shiki-themes.ts
 *
 * Output shape is a subset of the full `Theme` interface — we emit the
 * slots where Shiki data gives us confidence, and everything else
 * inherits from `defaults` in `src/style/theme.ts` (which themselves
 * reference slots by name, so inheritance is automatic).
 */

import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { bundledThemes } from "shiki"
import { parseHex, toHex } from "../src/index.ts"

/** Which Shiki themes we want to ship as first-class TUI themes.
 *  Order here defines the write order; no functional meaning. */
const THEMES: readonly string[] = [
  "catppuccin-mocha",
  "catppuccin-latte",
  "dracula",
  "nord",
  "github-dark",
  "github-light",
  "gruvbox-dark-medium",
  "one-dark-pro",
  "rose-pine",
]

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, "../assets/themes")

type Colors = Record<string, string | undefined>

/** Pick the first non-empty value from a list of candidate keys. */
function pick(c: Colors, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = c[k]
    if (typeof v === "string" && v.length > 0) return toHex(parseHex(v))
  }
  return undefined
}

/** Convert a shiki theme's `colors` map into our `Theme` shape. */
function toTui(id: string, c: Colors): Record<string, unknown> {
  // console.log(c)
  const fg = pick(c, "editor.foreground")
  const bg = pick(c, "editor.background")
  const primary = pick(c, "textLink.foreground", "charts.blue", "terminal.ansiBlue")
  const accent = pick(c, "charts.purple", "terminal.ansiMagenta")
  const success = pick(c, "charts.green", "terminal.ansiGreen")
  const info = pick(c, "charts.blue", "terminal.ansiBlue")
  const warn = pick(c, "editorWarning.foreground", "charts.yellow", "terminal.ansiYellow")
  const error = pick(
    c,
    "errorForeground",
    "editorError.foreground",
    "charts.red",
    "terminal.ansiRed"
  )
  const muted = pick(c, "terminal.ansiBrightBlack", "charts.lines", "panel.border")
  const dim = pick(c, "terminal.ansiWhite", "charts.lines") ?? muted
  const border = pick(c, "panel.border", "editorGroup.border") ?? muted
  // Shiki emits translucent `#rrggbbaa` for diff/selection tints —
  // keep the alpha. Our color resolver composites against the theme
  // bg, which is exactly what these VSCode slots expect.
  const diffAddBg = pick(c, "diffEditor.insertedTextBackground")
  const diffDelBg = pick(c, "diffEditor.removedTextBackground")
  const menuActiveBg = pick(c, "list.activeSelectionBackground", "editor.selectionBackground")
  const codeBg = pick(c, "textCodeBlock.background", "editorInlayHint.background")

  const out: Record<string, unknown> = {
    $schema: "file:./../schemas/theme.schema.json",
    /** Matching shiki theme name — used by the markdown/code renderers
     *  so syntax highlighting aligns with the TUI palette. */
    shiki: id,
    text: fg,
    blend: bg,
    ui: { bg, fg },
    primary,
    accent,
    dim,
    muted,
    success,
    info,
    warn,
    error,
    border,
  }

  if (diffAddBg) out.diffAdd = { bg: diffAddBg }
  if (diffDelBg) out.diffDel = { bg: diffDelBg }
  if (menuActiveBg) out.menuActive = { bg: menuActiveBg }
  if (codeBg) out.code = { bg: codeBg }
  if (codeBg) out.mdCodeBlock = { bg: codeBg }

  // Drop undefined keys — the JSON schema won't accept them and we
  // want missing slots to fall back to the built-in defaults.
  for (const [k, v] of Object.entries(out)) {
    if (v === undefined) Reflect.deleteProperty(out, k)
  }
  return out
}

async function build(id: string): Promise<void> {
  const loader = (bundledThemes as Record<string, undefined | (() => Promise<unknown>)>)[id]
  if (!loader) {
    console.error(`!  unknown shiki theme: ${id}`)
    return
  }
  const mod = (await loader()) as { default?: { colors?: Colors } } & { colors?: Colors }
  const theme = mod.default ?? mod
  const colors = theme.colors ?? {}
  const tui = toTui(id, colors)
  const path = resolve(outDir, `${id}.json`)
  // oxlint-disable-next-line no-null -- JSON.stringify's replacer arg
  writeFileSync(path, `${JSON.stringify(tui, null, 2)}\n`)
  console.log(`✔  ${id}.json`)
}

// Build in parallel — bundledThemes loaders are independent. Keeps
// the script snappy even as the theme list grows.
await Promise.all(THEMES.map((id) => build(id)))
