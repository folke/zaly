import type { AnsiStyle, HexColor } from "../style/types.ts"
import type { ShikiLanguage, ShikiTheme } from "./types.ts"

import { createHighlighterCore } from "shiki/core"
import { createOnigurumaEngine } from "shiki/engine/oniguruma"
import { bundledLanguages as bundled } from "shiki/langs"
import { isShikiLang, isShikiTheme } from "../schemas/gen/shiki.ts"
import { openAnsi, RESET } from "../style/ansi.ts"

export type AnsiHighlighter = (code: string, lang?: string) => string

export type ShikiStatus =
  | { loaded: true }
  | { loaded: false; missing: { langs: string[]; themes: string[] } }

type L = ShikiLanguage
type T = ShikiTheme

const THEME: ShikiTheme = "tokyo-night"

// See: https://github.com/shikijs/vscode-textmate/blob/19dc9b889aa47df91027e857cdad518760b5a026/src/theme.ts#L326
const enum FontStyle {
  NotSet = -1,
  None = 0,
  Italic = 1,
  Bold = 2,
  Underline = 4,
  Strikethrough = 8,
}

const highlighter = await createHighlighterCore({
  engine: await createOnigurumaEngine(import("shiki/wasm")),
  langs: [],
  themes: [],
  warnings: false,
})

class Shiki {
  #loading?: Promise<void>
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

  async highlight(code: string, lang: string, theme = THEME) {
    await this.load(lang, theme)

    if (!this.#themes.loaded.has(theme)) throw new Error(`Theme ${theme} not loaded`)
    if (!this.#langs.loaded.has(lang as L)) return code

    const t = highlighter.getTheme(theme)
    let output = ""
    const lines = highlighter.codeToTokensBase(code, { lang: lang as L })

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
    return output.replace(/\n+$/, "")
  }

  isLang(lang: string): lang is ShikiLanguage {
    return isShikiLang(lang)
  }

  isTheme(theme: string): theme is ShikiTheme {
    return isShikiTheme(theme)
  }
}

export const shiki = new Shiki()
