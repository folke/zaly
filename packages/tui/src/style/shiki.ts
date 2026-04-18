import type { BundledLanguage, BundledTheme, HighlighterCore } from "shiki"

import { createHighlighterCore } from "shiki/core"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"
import { bundledLanguages } from "shiki/langs.mjs"
import { RESET } from "./ansi.ts"
import { colorParams } from "./color.ts"

export type CodeToAnsiOptions = {
  theme?: T
  langs: string[]
}

export type AnsiHighlighter = (code: string, lang: string) => string

type L = BundledLanguage
type T = BundledTheme

export type ShikiTheme = T
export type ShikiLanguage = L

const THEME: T = "tokyo-night"
let H: HighlighterCore | undefined // PERF: singleton highlighter instance
let loading: Promise<HighlighterCore> | undefined

// See: https://github.com/shikijs/vscode-textmate/blob/19dc9b889aa47df91027e857cdad518760b5a026/src/theme.ts#L326
const enum FontStyle {
  NotSet = -1,
  None = 0,
  Italic = 1,
  Bold = 2,
  Underline = 4,
  Strikethrough = 8,
}

// Tiny picocolors-style helper: wrap text with a single SGR attr and close
// it. Only the four attrs shiki reports via token.fontStyle.
function attr(text: string, code: number): string {
  return `\x1b[${code}m${text}${RESET}`
}
const pc = {
  bold: (t: string) => attr(t, 1),
  italic: (t: string) => attr(t, 3),
  strikethrough: (t: string) => attr(t, 9),
  underline: (t: string) => attr(t, 4),
}

/**
 * Wrap `text` with an SGR fg escape derived from a hex color. The theme-type
 * hint ("dark" / "light") is accepted for parity with the rekal helper but
 * unused here — we emit the hex directly and trust the terminal to handle
 * contrast. If the hex is unparseable, the text passes through unstyled.
 */
function hexToAnsi(text: string, hex: string, _type: "dark" | "light"): string {
  const params = colorParams(hex, "fg")
  if (params === undefined) return text
  return `\x1b[${params}m${text}${RESET}`
}

async function getSingleton() {
  return (H ??= await createHighlighterCore({
    engine: await createOnigurumaEngine(import("shiki/wasm")),
    langs: [],
    themes: [],
    warnings: false,
  }))
}

export async function createAnsiHighlighter(opts: CodeToAnsiOptions) {
  const o = { ...opts, theme: opts.theme ?? THEME }
  // Chain synchronously — no `await` before this assignment. That way any
  // caller arriving in the meantime sees the just-appended promise and
  // queues behind it, instead of both racing through the same "nothing in
  // flight" window and double-loading.
  loading = (loading ?? Promise.resolve()).then(() => load(o))
  const highlighter = await loading
  return (code: string, lang: string) => {
    if (!isLang(lang)) return code
    let output = ""
    const lines = highlighter.codeToTokensBase(code, { lang })
    const theme = highlighter.getTheme(o.theme)

    for (const line of lines) {
      for (const token of line) {
        let text = token.content
        const color = token.color ?? theme.fg
        if (color) text = hexToAnsi(text, color, theme.type)
        if (token.fontStyle) {
          if (token.fontStyle & FontStyle.Bold) text = pc.bold(text)
          if (token.fontStyle & FontStyle.Italic) text = pc.italic(text)
          if (token.fontStyle & FontStyle.Underline) text = pc.underline(text)
          if (token.fontStyle & FontStyle.Strikethrough) text = pc.strikethrough(text)
        }
        output += text
      }
      output += "\n"
    }
    return output
  }
}

async function load(opts: Required<CodeToAnsiOptions>): Promise<HighlighterCore> {
  const highlighter = await getSingleton()

  const loadedLangs = new Set(highlighter.getLoadedLanguages())

  const langs = opts.langs
    .filter((l) => !loadedLangs.has(l) && isLang(l))
    .map((l) => bundledLanguages[l as L]())

  const loadedThemes = new Set(highlighter.getLoadedThemes())
  const theme = loadedThemes.has(opts.theme) ? undefined : import(`shiki/themes/${opts.theme}.mjs`)

  if (langs.length === 0 && !theme) return highlighter

  await Promise.all([...langs, theme])
  if (langs.length > 0) await highlighter.loadLanguage(...langs)
  if (theme) await highlighter.loadTheme(theme)
  return highlighter
}

export async function codeToAnsi(code: string, lang: string, theme: T = THEME): Promise<string> {
  if (!isLang(lang)) return code
  return createAnsiHighlighter({
    langs: [lang],
    theme,
  }).then((highlight) => highlight(code, lang))
}

export function isLang(lang: string): lang is BundledLanguage {
  return lang in bundledLanguages
}
