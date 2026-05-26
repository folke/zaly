import type {
  BundledLanguage,
  BundledTheme,
  DynamicImportLanguageRegistration,
  HighlighterCore,
} from "shiki/types"
import type { AnsiStyle, HexColor } from "./types.ts"

import { hasColors } from "@zaly/shared/env"
import { RenderContext } from "../core/ctx.ts"
import { createAsync, useContext } from "../core/reactive.ts"
import { isShikiLang, isShikiTheme } from "../schemas/gen/shiki.ts"
import { openAnsi, RESET } from "./ansi.ts"

export type CodeToAnsiOptions = {
  theme?: T
  langs: string[]
}

export type AnsiHighlighter = (code: string, lang?: string) => string

export type ShikiStatus =
  | { loaded: true }
  | { loaded: false; missing: { langs: string[]; themes: string[] } }

type L = BundledLanguage
type T = BundledTheme

export type ShikiTheme = T
export type ShikiLanguage = L

const THEME: T = "tokyo-night"

// See: https://github.com/shikijs/vscode-textmate/blob/19dc9b889aa47df91027e857cdad518760b5a026/src/theme.ts#L326
const enum FontStyle {
  NotSet = -1,
  None = 0,
  Italic = 1,
  Bold = 2,
  Underline = 4,
  Strikethrough = 8,
}

class Shiki {
  #highlighter?: HighlighterCore
  #loading?: Promise<void>
  #highligterPromise?: Promise<HighlighterCore>
  #bundledLangs?: Promise<Record<BundledLanguage, DynamicImportLanguageRegistration>>
  #langs = { loaded: new Set<L>(), wanted: new Set<L>() }
  #themes = { loaded: new Set<T>(), wanted: new Set<T>() }

  status(langs: string | string[], themes?: string | string[]): ShikiStatus {
    themes ??= []
    themes = Array.isArray(themes) ? themes : [themes]
    themes = themes.length > 0 ? themes : [THEME]
    langs = Array.isArray(langs) ? langs : [langs]
    langs = langs.filter(isShikiLang).filter((l) => !this.#langs.loaded.has(l))
    themes = themes.filter(isShikiTheme).filter((t) => !this.#themes.loaded.has(t))
    return { loaded: langs.length === 0 && themes.length === 0, missing: { langs, themes } }
  }

  async load(langs: string | string[], themes?: string | string[]) {
    const status = this.status(langs, themes)
    if (status.loaded) return

    for (const l of status.missing.langs) this.#langs.wanted.add(l as L)
    for (const t of status.missing.themes) this.#themes.wanted.add(t as T)

    const highlighter = (this.#highlighter ??= await this.#loadHighlighter())
    const bundled = await (this.#bundledLangs ??= import("shiki/langs").then(
      (m) => m.bundledLanguages
    ))
    if (this.status(langs, themes).loaded) return

    const load = async () => {
      const loadLangs = [...this.#langs.wanted]
        .filter((l) => !this.#langs.loaded.has(l))
        .map((l) => bundled[l]())

      const loadThemes = [...this.#themes.wanted]
        .filter((t) => !this.#themes.loaded.has(t))
        .map((t) => import(`shiki/themes/${t}.mjs`))

      if (loadLangs.length === 0 && loadThemes.length === 0) return

      await Promise.all([...loadLangs, ...loadThemes])

      if (loadLangs.length > 0) await highlighter.loadLanguage(...loadLangs)
      if (loadThemes.length > 0) await highlighter.loadTheme(...loadThemes)

      for (const l of highlighter.getLoadedLanguages()) this.#langs.loaded.add(l as L)
      for (const t of highlighter.getLoadedThemes()) this.#themes.loaded.add(t as T)
    }

    this.#loading = (this.#loading ?? Promise.resolve()).then(load, load)
    await this.#loading
  }

  async #loadHighlighter() {
    this.#highligterPromise ??= (async () => {
      const [{ createHighlighterCore }, { createOnigurumaEngine }] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/oniguruma"),
      ])
      return createHighlighterCore({
        engine: await createOnigurumaEngine(import("shiki/wasm")),
        langs: [],
        themes: [],
        warnings: false,
      })
    })()
    return await this.#highligterPromise
  }

  highlight(code: string, lang: string, theme = THEME) {
    if (!this.#highlighter) throw new Error("Highlighter not loaded")
    if (!this.#themes.loaded.has(theme)) throw new Error(`Theme ${theme} not loaded`)

    if (!this.#langs.loaded.has(lang as L)) return code

    const t = this.#highlighter.getTheme(theme)
    let output = ""
    const lines = this.#highlighter.codeToTokensBase(code, { lang: lang as L })

    for (const line of lines) {
      for (const token of line) {
        const text = token.content
        const style: AnsiStyle = {
          bg: token.bgColor as HexColor | undefined,
          fg: (token.color ?? t.fg) as HexColor | undefined,
        }
        if (token.fontStyle) {
          if (token.fontStyle & FontStyle.Bold) style.bold = true
          if (token.fontStyle & FontStyle.Italic) style.italic = true
          if (token.fontStyle & FontStyle.Underline) style.underline = true
          if (token.fontStyle & FontStyle.Strikethrough) style.strikethrough = true
        }
        output += openAnsi(style) + text + RESET
      }
      output += "\n"
    }
    return output.replace(/\n$/, "")
  }

  highlighter(theme?: ShikiTheme): AnsiHighlighter {
    return (code: string, lang?: string) => (lang ? this.highlight(code, lang, theme) : code)
  }

  isLang(lang: string): lang is ShikiLanguage {
    return isShikiLang(lang)
  }

  isTheme(theme: string): theme is ShikiTheme {
    return isShikiTheme(theme)
  }

  /** Must be called from inside a widget body (or any scope under the
   *  Renderer's root Owner) — uses `useContext(RenderContext)` to read
   *  the current theme. Outside such scope, falls back to default theme. */
  createLoader(lang: () => string | string[] | undefined) {
    const context = useContext(RenderContext)
    return createAsync(async () => {
      if (!hasColors) return
      let langs = lang() ?? []
      langs = Array.isArray(langs) ? langs : [langs]
      if (langs.length === 0) return
      const theme = context?.style().theme.shiki
      const status = this.status(langs, theme)
      if (!status.loaded) await this.load(status.missing.langs, status.missing.themes)
      return this.highlighter(theme)
    })
  }
}

export const shiki = new Shiki()

export async function codeToAnsi(code: string, lang: string, theme: T = THEME): Promise<string> {
  await shiki.load([lang], [theme])
  return shiki.highlight(code, lang, theme)
}

/**
 * Collect all fenced-block languages from a markdown source. First
 * whitespace-delimited token of each info-string is the language; duplicates
 * are deduped. Unknown-to-shiki names pass through and get filtered out by
 * `createAnsiHighlighter`.
 */
export function markdownCodeLangs(md: string): ShikiLanguage[] {
  const langs = new Set<string>()
  for (const m of md.matchAll(/^\s*`{3,}([^\n]+)$/gm)) {
    const lang = m[1].trim().split(/\s/)[0]
    if (lang !== "") langs.add(lang)
  }
  return [...langs].filter((l) => shiki.isLang(l))
}
