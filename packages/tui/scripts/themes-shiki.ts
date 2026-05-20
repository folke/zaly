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

import type { ThemeRegistrationResolved } from "shiki"
import type { Color, HexColor, Style } from "../src/index.ts"
import type { ShikiTheme } from "../src/style/shiki.ts"
import type { Theme } from "../src/themes/types.ts"

import { writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { bundledThemes, normalizeTheme } from "shiki"
import { parseHex, toHex } from "../src/style/color.ts"

/** Which Shiki themes we want to ship as first-class TUI themes.
 *  Order here defines the write order; no functional meaning. */
const THEMES = [
  "ayu-dark",
  "catppuccin-frappe",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "dracula",
  "github-dark",
  "github-light",
  "gruvbox-dark-medium",
  "material-theme-palenight",
  "min-dark",
  "min-light",
  "monokai",
  "night-owl",
  "nord",
  "one-dark-pro",
  "one-light",
  "poimandres",
  "rose-pine",
  "solarized-dark",
  "solarized-light",
  "synthwave-84",
  "vesper",
  "vitesse-dark",
  "vitesse-light",
] as const satisfies readonly ShikiTheme[]

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, "../assets/themes")

function parseColor(bg: HexColor, hex?: string): HexColor | undefined {
  if (hex === undefined) return
  // blend hex alpha against the theme bg, since that's what these slots are meant for and
  if (hex.length < 9) return hex as HexColor
  const rgb = parseHex(bg)
  const base = hex.slice(0, 7) as HexColor
  const fg = parseHex(base)
  const alpha = Number.parseInt(hex.slice(7, 9), 16) / 255
  const blended = rgb.map((c, i) => Math.round(c * (1 - alpha) + fg[i] * alpha))
  return toHex(blended[0], blended[1], blended[2])
}

function parse(theme: ThemeRegistrationResolved) {
  const rules = new Map<string, Style>()
  const bg = theme.bg as HexColor
  const settings = theme.settings
  for (const s of settings) {
    // oxlint-disable-next-line typescript/no-unnecessary-condition
    if (!s.settings) continue
    const scopes = (typeof s.scope === "string" ? s.scope.split(",") : (s.scope ?? [])).map((sc) =>
      sc.trim()
    )
    const style: Style = {
      bold: s.settings.fontStyle?.includes("bold"),
      italic: s.settings.fontStyle?.includes("italic"),
      underline: s.settings.fontStyle?.includes("underline"),
      strikethrough: s.settings.fontStyle?.includes("strikethrough"),
      fg: parseColor(bg, s.settings.foreground),
      bg: parseColor(bg, s.settings.background),
    }
    for (const scope of scopes) {
      rules.set(scope, Object.fromEntries(Object.entries(style).filter(([_, v]) => v)) as Style)
    }
  }
  // Scope-rule lookup: walks `a.b.c` → `a.b` → `a` until a settings
  // entry matches. First key that resolves wins.
  const style = (...keys: string[]) => {
    for (const k of keys) {
      const parts = k.split(".")
      for (let i = parts.length; i > 0; i--) {
        const scope = parts.slice(0, i).join(".")
        if (rules.has(scope)) return rules.get(scope)
      }
    }
  }
  // VSCode color-slot lookup: walks `theme.colors` for any of the
  // given keys (`terminal.ansiBlue`, `editorLink.activeForeground`,
  // …). Alpha-blends against the theme bg. First defined value wins.
  const colors = theme.colors ?? {}
  const color = (...keys: string[]): HexColor | undefined => {
    for (const k of keys) {
      const v = colors[k]
      if (v) return parseColor(bg, v)
    }
  }

  return {
    scopes: [...rules.keys()].toSorted(),
    style,
    color,
    fg: (...keys: string[]) => keys.map((k) => style(k)?.fg).find((v) => v !== undefined),
    bg: (...keys: string[]) => keys.map((k) => style(k)?.bg).find((v) => v !== undefined),
  }
}

/** Convert a shiki theme's `colors` map + `settings` rules into our
 *  `Theme` shape. Two helpers in play:
 *    - `t.color(...vsKeys)`: VSCode UI color names (`terminal.ansiBlue`,
 *      `panel.border`, `diffEditor.insertedTextBackground`, …) → look up
 *      `theme.colors[key]`, alpha-blend against the theme bg.
 *    - `t.style(...scopes)`: TextMate scope names (`comment`,
 *      `heading.1.markdown`, `markup.bold`, …) → walk the `settings`
 *      rules to find a Style (with `fg` / `bg` / `bold` / `italic`).
 *
 *  Slots only get emitted when the theme actually defines them.
 *  Anything missing falls back to `defaults` in `themes/default.ts`. */
function toTui(id: ShikiTheme, theme: ThemeRegistrationResolved): Partial<Theme> {
  const t = parse(theme)
  const fg = theme.fg as HexColor
  const bg = theme.bg as HexColor

  const extend = (s: Style | undefined, e: Style) => (s ? { ...s, ...e } : undefined)

  const out: Partial<Theme> & { $schema: string } = {
    $schema: "file:./../schemas/theme.schema.json",
    /** Matching shiki theme name — used by the markdown/code renderers
     *  so syntax highlighting aligns with the TUI palette. */
    shiki: id,

    // ── base palette (VSCode color slots) ──────────────────────────────
    text: fg,
    subtle: t.color("terminal.ansiBrightBlack"),
    ui: { bg, fg },
    primary: t.color("textLink.foreground", "terminal.ansiBlue"),
    accent: t.color("textLink.activeForeground", "terminal.ansiMagenta"),
    success: t.color("terminal.ansiGreen", "gitDecoration.addedResourceForeground"),
    info: t.color("terminal.ansiCyan", "terminal.ansiBlue"),
    warn: t.color("editorWarning.foreground", "terminal.ansiYellow"),
    error: t.color("editorError.foreground", "terminal.ansiRed"),
    muted: t.color("terminal.ansiBrightBlack", "editorWhitespace.foreground"),
    border: t.color("panel.border", "editorGroup.border", "terminal.ansiBrightBlack"),

    // ── code / surfaces (VSCode color slots) ───────────────────────────
    code: optBg(t.color("textCodeBlock.background", "editor.background")),
    mdCodeBlock: optBg(t.color("textCodeBlock.background", "editor.background")),
    overlay: optBg(t.color("editorWidget.background", "menu.background")),
    highlight: optBg(t.color("editor.selectionBackground", "list.activeSelectionBackground")),
    menuActive: optBg(t.color("list.activeSelectionBackground", "editor.selectionBackground")),
    selection: optBg(t.color("editor.selectionBackground")),

    // ── diff (mix VSCode bg + TextMate fg) ─────────────────────────────
    diffAdd: combine(
      t.color("diffEditor.insertedTextBackground", "diffEditor.insertedLineBackground"),
      t.fg("markup.inserted.diff")
    ),
    diffDel: combine(
      t.color("diffEditor.removedTextBackground", "diffEditor.removedLineBackground"),
      t.fg("markup.deleted.diff")
    ),
    diffTitle: t.style("meta.diff.header.from-file", "meta.diff.header.to-file"),

    // ── code annotations (scope rules) ─────────────────────────────────
    comment: t.style("comment"),

    // ── markdown (scope rules) ─────────────────────────────────────────
    mdHeading: extend(t.style("heading.1.markdown", "markup.heading"), { bold: true }),
    mdHeading1: extend(t.style("heading.1.markdown", "markup.heading.heading-1"), { bold: true }),
    mdHeading2: extend(t.style("heading.2.markdown", "markup.heading.heading-2"), { bold: true }),
    mdHeading3: extend(t.style("heading.3.markdown", "markup.heading.heading-3"), { bold: true }),
    mdHeading4: extend(t.style("heading.4.markdown", "markup.heading.heading-4"), { bold: true }),
    mdHeading5: extend(t.style("heading.5.markdown", "markup.heading.heading-5"), { bold: true }),
    mdHeading6: extend(t.style("heading.6.markdown", "markup.heading.heading-6"), { bold: true }),
    mdBold: t.style("markup.bold"),
    mdItalic: t.style("markup.italic"),
    mdStrikethrough: t.style("markup.strikethrough"),
    mdLink: t.style("markup.link", "markup.underline.link", "string.other.link.title.markdown"),
    mdQuote: t.style("markup.quote"),
    mdListBullet: t.style("markup.list.bullet"),
    mdCode: t.style("markup.inline.raw.string.markdown", "markup.raw"),
    mdHr: t.style("meta.separator.markdown"),
  }

  // Drop undefined keys — the JSON schema won't accept them and we
  // want missing slots to fall back to the built-in defaults.
  for (const [k, v] of Object.entries(out) as [string, unknown][]) {
    if (v === undefined) Reflect.deleteProperty(out, k)
  }
  return out
}

/** Wrap a `bg` color in a Style only when defined; lets `out.foo =
 *  optBg(...)` produce undefined for missing slots so the cleanup pass
 *  drops them. */
function optBg(bg: HexColor | undefined): Style | undefined {
  return bg ? { bg } : undefined
}

/** Build a Style with whatever of `bg` / `fg` are defined; undefined
 *  when neither is. */
function combine(bg: Color | undefined, fg: Color | undefined): Style | undefined {
  if (!bg && !fg) return undefined
  const s: Style = {}
  if (bg) s.bg = bg
  if (fg) s.fg = fg
  return s
}

async function build(id: ShikiTheme): Promise<void> {
  const loader = bundledThemes[id]
  const mod = await loader()
  const theme = mod.default
  const tui = toTui(id, normalizeTheme(theme))
  const path = resolve(outDir, `${id}.json`)
  // oxlint-disable-next-line no-null -- JSON.stringify's replacer arg
  writeFileSync(path, `${JSON.stringify(tui, null, 2)}\n`)
  console.log(`✔  ${id}.json`)
}

// Build in parallel — bundledThemes loaders are independent. Keeps
// the script snappy even as the theme list grows.
await Promise.all(THEMES.map((id) => build(id)))
