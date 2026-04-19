import type { BundledLanguage, BundledTheme, HighlighterCore, LanguageInput } from "shiki"

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

// Shiki + its engines + the bundled-language registry are heavy ESM
// graphs (~30ms of module-load on a warm cache). We never need any of
// them until the first markdown code block is highlighted, so everything
// lives behind dynamic imports and a singleton guard.
let H: HighlighterCore | undefined
let loading: Promise<HighlighterCore> | undefined
let bundledLangs: Record<string, () => LanguageInput> | undefined

// See: https://github.com/shikijs/vscode-textmate/blob/19dc9b889aa47df91027e857cdad518760b5a026/src/theme.ts#L326
const enum FontStyle {
  NotSet = -1,
  None = 0,
  Italic = 1,
  Bold = 2,
  Underline = 4,
  Strikethrough = 8,
}

function attr(text: string, code: number): string {
  return `\x1b[${code}m${text}${RESET}`
}
const pc = {
  bold: (t: string) => attr(t, 1),
  italic: (t: string) => attr(t, 3),
  strikethrough: (t: string) => attr(t, 9),
  underline: (t: string) => attr(t, 4),
}

function hexToAnsi(text: string, hex: string, _type: "dark" | "light"): string {
  const params = colorParams(hex, "fg")
  if (params === undefined) return text
  return `\x1b[${params}m${text}${RESET}`
}

async function getSingleton(): Promise<HighlighterCore> {
  if (H) return H
  const [{ createHighlighterCore }, { createOnigurumaEngine }, langsMod] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/oniguruma"),
    import("shiki/langs.mjs"),
  ])
  bundledLangs = langsMod.bundledLanguages as Record<string, () => LanguageInput>
  H = await createHighlighterCore({
    engine: await createOnigurumaEngine(import("shiki/wasm")),
    langs: [],
    themes: [],
    warnings: false,
  })
  return H
}

export async function createAnsiHighlighter(opts: CodeToAnsiOptions): Promise<AnsiHighlighter> {
  const o = { ...opts, theme: opts.theme ?? THEME }
  // Chain synchronously — no `await` before this assignment. That way any
  // caller arriving in the meantime sees the just-appended promise and
  // queues behind it, instead of both racing through the same "nothing in
  // flight" window and double-loading.
  loading = (loading ?? Promise.resolve()).then(() => load(o))
  const highlighter = await loading
  // Capture the set of langs the highlighter actually has loaded, so the
  // returned sync closure can filter unknown langs without re-checking a
  // dynamic module import.
  const loadedLangs = new Set(highlighter.getLoadedLanguages())
  return (code: string, lang: string) => {
    if (!loadedLangs.has(lang)) return code
    let output = ""
    const lines = highlighter.codeToTokensBase(code, { lang: lang as L })
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
  // `bundledLangs` is guaranteed populated after `getSingleton`.
  const langs = bundledLangs!

  const loadedLangs = new Set(highlighter.getLoadedLanguages())
  const toLoad = opts.langs
    .filter((l) => !loadedLangs.has(l) && l in langs)
    .map((l) => langs[l]())

  const loadedThemes = new Set(highlighter.getLoadedThemes())
  const theme = loadedThemes.has(opts.theme) ? undefined : import(`shiki/themes/${opts.theme}.mjs`)

  if (toLoad.length === 0 && !theme) return highlighter

  await Promise.all([...toLoad, theme])
  if (toLoad.length > 0) await highlighter.loadLanguage(...toLoad)
  if (theme) await highlighter.loadTheme(theme)
  return highlighter
}

export async function codeToAnsi(code: string, lang: string, theme: T = THEME): Promise<string> {
  const highlight = await createAnsiHighlighter({ langs: [lang], theme })
  return highlight(code, lang)
}

export async function isLang(lang: string): Promise<boolean> {
  if (!bundledLangs) {
    const mod = await import("shiki/langs.mjs")
    bundledLangs = mod.bundledLanguages as Record<string, () => LanguageInput>
  }
  return lang in bundledLangs
}
