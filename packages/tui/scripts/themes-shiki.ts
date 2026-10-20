/** Generate built-in themes: `bun scripts/themes-shiki.ts` from packages/tui. */
import type { ThemeRegistrationResolved } from "shiki"
import type { ShikiTheme } from "../src/shiki/types.ts"
import type { CustomTheme } from "../src/themes/default.ts"

import { toError } from "@zaly/shared"
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { bundledThemes, normalizeTheme } from "shiki"
import { validateTheme } from "../src/schemas/theme.ts"
import { blend } from "../src/style/color.ts"
import { createThemeResolver } from "./themes-textmate.ts"

export const THEMES = [
  "andromeeda",
  "ayu-dark",
  "ayu-light",
  "ayu-mirage",
  "catppuccin-frappe",
  "catppuccin-latte",
  "catppuccin-macchiato",
  "catppuccin-mocha",
  "dark-plus",
  "dracula",
  "everforest-dark",
  "everforest-light",
  "github-dark-default",
  "github-dark-dimmed",
  "github-light-default",
  "gruvbox-dark-hard",
  "gruvbox-dark-medium",
  "gruvbox-light-medium",
  "horizon",
  "horizon-bright",
  "kanagawa-dragon",
  "kanagawa-lotus",
  "kanagawa-wave",
  "light-plus",
  "material-theme",
  "material-theme-lighter",
  "material-theme-palenight",
  "min-dark",
  "min-light",
  "monokai",
  "night-owl",
  "night-owl-light",
  "nord",
  "one-dark-pro",
  "one-light",
  "poimandres",
  "rose-pine",
  "rose-pine-dawn",
  "rose-pine-moon",
  "solarized-dark",
  "solarized-light",
  "synthwave-84",
  "vesper",
  "vitesse-black",
  "vitesse-dark",
  "vitesse-light",
] as const satisfies readonly ShikiTheme[]

const outDir = resolve(import.meta.dirname, "../assets/themes")

export function toTui(id: ShikiTheme, theme: ThemeRegistrationResolved): CustomTheme {
  const t = createThemeResolver(theme)
  // Representative TypeScript scopes give language-specific rules their proper
  // context. Uncolored categories intentionally resolve to the theme foreground.
  const syntax = {
    syntaxBoolean: t.resolve("source.ts meta.var.expr.ts constant.language.boolean.true.ts"),
    syntaxBracket: t.resolve(
      "source.ts meta.function.ts meta.parameters.ts punctuation.definition.parameters.begin.ts"
    ),
    syntaxConstant: t.resolve(
      "source.ts meta.var.expr.ts meta.var-single-variable.expr.ts meta.definition.variable.ts variable.other.constant.ts"
    ),
    syntaxDelimiter: t.resolve("source.ts punctuation.terminator.statement.ts"),
    syntaxField: t.resolve("source.ts variable.other.property.ts"),
    syntaxFunction: t.resolve(
      "source.ts meta.function.ts meta.definition.function.ts entity.name.function.ts"
    ),
    syntaxNumber: t.resolve(
      "source.ts meta.var.expr.ts meta.objectliteral.ts meta.object.member.ts constant.numeric.decimal.ts"
    ),
    syntaxSpecial: t.resolve("source.ts meta.function.ts meta.block.ts keyword.control.flow.ts"),
    syntaxString: t.resolve("source.ts meta.function.ts meta.block.ts string.quoted.double.ts"),
  }

  // Text
  const primary =
    t.color("textLink.foreground", "terminal.ansiBlue") ??
    t.tokenColor("markup.underline.link", "string.other.link") ??
    syntax.syntaxFunction.fg
  const accent =
    t.color("textLink.activeForeground", "terminal.ansiMagenta") ?? syntax.syntaxSpecial.fg

  // Log levels
  const success =
    t.color(
      "terminal.ansiGreen",
      "gitDecoration.addedResourceForeground",
      "editorGutter.addedBackground"
    ) ??
    t.tokenColor("markup.inserted.diff", "markup.inserted") ??
    syntax.syntaxString.fg
  const info = t.color("terminal.ansiCyan", "terminal.ansiBlue", "editorInfo.foreground") ?? primary
  const warn = t.color("editorWarning.foreground", "terminal.ansiYellow") ?? syntax.syntaxNumber.fg
  const error =
    t.color(
      "editorError.foreground",
      "terminal.ansiRed",
      "gitDecoration.deletedResourceForeground",
      "editorGutter.deletedBackground"
    ) ??
    t.tokenColor("markup.deleted.diff", "markup.deleted", "invalid.illegal") ??
    accent

  const selectionBg = t.color(
    "editor.selectionBackground",
    "list.activeSelectionBackground",
    "terminal.selectionBackground",
    "editor.inactiveSelectionBackground",
    "terminal.inactiveSelectionBackground"
  )

  const out: CustomTheme = {
    $schema:
      "https://raw.githubusercontent.com/folke/zaly/main/packages/tui/assets/schemas/theme.schema.json",
    id,
    name: theme.displayName ?? id,
    shiki: id,
    bg: t.bg,
    fg: t.fg,
    primary,
    accent,
    success,
    info,
    warn,
    error,
    selection: selectionBg ? { bg: selectionBg } : { inverse: true },
    diffAdd: {
      bg:
        t.color(
          "diffEditor.insertedLineBackground",
          "diffEditor.insertedTextBackground",
          "inlineChatDiff.inserted"
        ) ?? blend(success, t.bg, 0.15),
    },
    diffDel: {
      bg:
        t.color(
          "diffEditor.removedLineBackground",
          "diffEditor.removedTextBackground",
          "inlineChatDiff.removed",
          "editorGutter.deletedBackground"
        ) ?? blend(error, t.bg, 0.15),
    },
    ...syntax,
  }

  const border = t.color("panel.border", "editorGroup.border", "terminal.ansiBrightBlack")
  if (border) out.border = border
  const comment = t.style("comment")
  if (comment) out.comment = comment

  const heading = (level: number) =>
    t.resolve(
      `text.html.markdown markup.heading.markdown heading.${level}.markdown entity.name.section.markdown`
    )
  const optional = {
    mdHeading: { ...heading(1), bold: true },
    mdHeading1: { ...heading(1), bold: true },
    mdHeading2: { ...heading(2), bold: true },
    mdHeading3: { ...heading(3), bold: true },
    mdHeading4: { ...heading(4), bold: true },
    mdHeading5: { ...heading(5), bold: true },
    mdHeading6: { ...heading(6), bold: true },
    mdBold: t.style("text.html.markdown meta.paragraph.markdown markup.bold.markdown"),
    mdItalic: t.style("text.html.markdown meta.paragraph.markdown markup.italic.markdown"),
    mdStrikethrough: t.style(
      "text.html.markdown meta.paragraph.markdown markup.strikethrough.markdown"
    ),
    mdLink: t.style(
      "text.html.markdown meta.paragraph.markdown meta.link.inline.markdown string.other.link.title.markdown"
    ),
    mdQuote: t.style("text.html.markdown markup.quote.markdown"),
    mdListBullet: t.style(
      "text.html.markdown markup.list.unnumbered.markdown punctuation.definition.list.begin.markdown",
      "markup.list.bullet"
    ),
    mdHr: t.style("text.html.markdown meta.separator.markdown"),
  } satisfies Partial<CustomTheme>
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) Object.assign(out, { [key]: value })
  }
  // Font resets matter while resolving rules, not in the flattened theme slots.
  for (const value of Object.values(out)) {
    if (typeof value !== "object") continue
    for (const attr of ["bold", "dim", "italic", "strikethrough", "underline"] as const) {
      if (value[attr] === false) delete value[attr]
    }
  }
  for (const [key, value] of Object.entries(out as Record<string, unknown>)) {
    if (typeof value !== "object") continue
    const fields = Object.values(value ?? {}).filter((v) => v !== undefined)
    if (fields.length === 0) delete out[key as keyof typeof out]
  }
  try {
    return validateTheme(out)
    // oxlint-disable-next-line unicorn/catch-error-name
  } catch (err) {
    console.error(`Error validating theme ${id}:`, toError(err).message)
    throw err
  }
}

async function main() {
  // Validate every theme before writing, so one bad mapping cannot leave a
  // partially regenerated set behind.
  const themes = await Promise.all(
    THEMES.map(async (id) => {
      const mod = await bundledThemes[id]()
      const theme = normalizeTheme(mod.default)
      return { id, theme: toTui(id, theme) }
    })
  )
  for (const { id, theme } of themes) {
    writeFileSync(resolve(outDir, `${id}.json`), `${JSON.stringify(theme, undefined, 2)}\n`)
    console.log(`✔ ${id}.json`)
  }
}

if (import.meta.main) await main()
