import type { Highlighter, ThemeRegistration } from "shiki"
import type { HexColor, Style } from "../../src/style/types.ts"

import { bundledThemes, createHighlighter, normalizeTheme } from "shiki"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { THEMES, toTui } from "../../scripts/themes-shiki.ts"
import { createThemeResolver, opaqueColor } from "../../scripts/themes-textmate.ts"
import { validateTheme } from "../../src/schemas/theme.ts"

function resolver(rules: ThemeRegistration["settings"]) {
  return createThemeResolver(
    normalizeTheme({
      name: "test",
      type: "dark",
      settings: [{ settings: { foreground: "#eeeeee", background: "#111111" } }, ...(rules ?? [])],
    })
  )
}

describe("TextMate theme resolution", () => {
  test("duplicate selectors merge colors while resetting font styles", () => {
    const t = resolver([
      { scope: "keyword", settings: { foreground: "#c792ea", fontStyle: "italic bold" } },
      { scope: "keyword", settings: { fontStyle: "" } },
    ])
    expect(t.resolve("keyword.control.ts")).toMatchObject({
      fg: "#c792ea",
      bold: false,
      italic: false,
    })
  })

  test("inherits dotted parent properties and respects specificity", () => {
    const t = resolver([
      { scope: "entity", settings: { foreground: "#123456", fontStyle: "italic" } },
      { scope: "entity.name.function", settings: { fontStyle: "bold" } },
      { scope: "entity", settings: { foreground: "#abcdef" } },
    ])
    expect(t.resolve("entity.name.function.ts")).toMatchObject({
      fg: "#abcdef",
      bold: true,
      italic: false,
    })
  })

  test("resolves parent-scope selectors and inherits outer scopes", () => {
    const t = resolver([
      { scope: "source.ts", settings: { foreground: "#123456" } },
      { scope: "variable", settings: { foreground: "#abcdef" } },
      { scope: "string variable", settings: { foreground: "#112233", fontStyle: "underline" } },
    ])
    expect(t.resolve("source.ts meta.uncolored").fg).toBe("#123456")
    expect(t.resolve("source.ts variable.other.ts").fg).toBe("#abcdef")
    expect(t.resolve("source.ts string.quoted variable.other.ts")).toMatchObject({
      fg: "#112233",
      underline: true,
    })
  })

  test("unmatched optional scopes do not replace semantic defaults", () => {
    const t = resolver([{ scope: "source", settings: { foreground: "#123456" } }])
    expect(t.style("source.ts markup.bold")).toBeUndefined()
    expect(t.resolve("source.ts markup.bold").fg).toBe("#123456")
  })

  test("supports comma-separated and array selectors", () => {
    const t = resolver([
      { scope: "string, constant", settings: { foreground: "#123456" } },
      { scope: ["keyword", "storage"], settings: { foreground: "#abcdef" } },
    ])
    expect(t.resolve("constant.numeric").fg).toBe("#123456")
    expect(t.resolve("storage.type").fg).toBe("#abcdef")
  })

  test("composites token foreground against its inherited token background", () => {
    const t = resolver([
      { scope: "string", settings: { background: "#ffffff" } },
      { scope: "variable", settings: { foreground: "#00000080" } },
    ])
    expect(t.resolve("string variable")).toMatchObject({ bg: "#ffffff", fg: "#7f7f7f" })
    expect(t.resolve("uncolored")).not.toHaveProperty("bg")
  })

  test("flattens short and long alpha hex colors, including transparent black", () => {
    expect(opaqueColor("#ffffff", "#0000")).toBe("#ffffff")
    expect(opaqueColor("#ffffff", "#0008")).toBe("#777777")
    expect(opaqueColor("#ffffff", "#00000080")).toBe("#7f7f7f")
    expect(opaqueColor("#ffffff", "#AbC")).toBe("#aabbcc")
    expect(() => opaqueColor("#ffffff", "#invalid")).toThrow()
  })
})

describe("Shiki selection fallbacks", () => {
  test.each(["editor.inactiveSelectionBackground", "terminal.inactiveSelectionBackground"])(
    "uses %s when an active selection color is absent",
    (key) => {
      const theme = normalizeTheme({
        name: "test",
        type: "dark",
        colors: {
          "editor.background": "#111111",
          "editor.foreground": "#eeeeee",
          [key]: "#334455",
        },
        tokenColors: [],
      })
      expect(toTui("dark-plus", theme).selection).toEqual({ bg: "#334455" })
    }
  )

  test("uses inverse selection when no selection colors are provided", () => {
    const theme = normalizeTheme({
      name: "test",
      type: "dark",
      colors: { "editor.background": "#111111", "editor.foreground": "#eeeeee" },
      tokenColors: [],
    })
    expect(toTui("dark-plus", theme).selection).toEqual({ inverse: true })
  })
})

let highlighter: Highlighter
beforeAll(async () => {
  highlighter = await createHighlighter({ themes: [...THEMES], langs: ["typescript", "markdown"] })
})
afterAll(() => highlighter.dispose())

describe.each(THEMES)("generated %s", (id) => {
  test("validates without any terminal ANSI color dependency", async () => {
    const mod = await bundledThemes[id]()
    const generated = toTui(id, normalizeTheme(mod.default))
    expect(validateTheme(generated)).toEqual(generated)
    expect(generated.shiki).toBe(id)
    expect(generated.$schema).toBe(
      "https://raw.githubusercontent.com/folke/zaly/main/packages/tui/assets/schemas/theme.schema.json"
    )
    const ansi =
      /^(?:black|red|green|yellow|blue|magenta|cyan|white|gr[ae]y|bright(?:Black|Red|Green|Yellow|Blue|Magenta|Cyan|White|Gr[ae]y))$/
    for (const value of Object.values(generated)) {
      if (typeof value === "string") expect(value).not.toMatch(ansi)
      else {
        for (const color of [value.fg, value.bg]) if (color) expect(color).not.toMatch(ansi)
        expect(Object.values(value)).not.toContain(false)
      }
    }
    expect((generated.syntaxConstant as Style).fg).toMatch(/^#[\da-f]{6}$/)
  })

  test("generated syntax slots match representative TypeScript tokens", async () => {
    const mod = await bundledThemes[id]()
    const generated = toTui(id, normalizeTheme(mod.default))
    const tokens = highlighter.codeToTokensBase(
      'const VALUE = true; const obj = { field: 42 }; obj.field; function greet() { return "hello"; }',
      { lang: "typescript", theme: id, includeExplanation: true }
    )
    const samples = [
      ["syntaxConstant", "VALUE"],
      ["syntaxBoolean", "true"],
      ["syntaxNumber", "42"],
      ["syntaxField", "field"],
      ["syntaxFunction", "greet"],
      ["syntaxBracket", "("],
      ["syntaxDelimiter", ";"],
      ["syntaxSpecial", "return"],
      ["syntaxString", "hello"],
    ] as const
    for (const [slot, content] of samples) {
      const candidates = tokens
        .flat()
        .filter((token) => token.explanation?.some((e) => e.content === content))
      const token = slot === "syntaxField" ? candidates.at(-1) : candidates[0]
      expect(token).toBeDefined()
      expect((generated[slot] as Style).fg).toBe(
        opaqueColor(generated.bg as HexColor, token!.color!)
      )
    }
  })

  test("matches actual Shiki token colors and font styles", async () => {
    const mod = await bundledThemes[id]()
    const theme = normalizeTheme(mod.default)
    const t = createThemeResolver(theme)
    for (const [lang, code] of [
      [
        "typescript",
        '// comment\nconst VALUE = true; const obj = { field: 42 }; obj.field; function greet() { return "hello"; }',
      ],
      [
        "markdown",
        "# Heading\n**bold** *italic* [link](https://example.com)\n> quote\n- bullet\n---",
      ],
    ] as const) {
      const tokens = highlighter.codeToTokensBase(code, {
        lang,
        theme: id,
        includeExplanation: true,
      })
      for (const token of tokens.flat()) {
        if (!token.content.trim()) continue
        for (const explanation of token.explanation ?? []) {
          if (!explanation.content.trim()) continue
          const resolved = t.resolve(explanation.scopes.map((scope) => scope.scopeName).join(" "))
          expect(resolved.fg).toBe(opaqueColor(t.bg, token.color ?? theme.fg))
          const font = token.fontStyle ?? 0
          expect([
            resolved.italic,
            resolved.bold,
            resolved.underline,
            resolved.strikethrough,
          ]).toEqual([!!(font & 1), !!(font & 2), !!(font & 4), !!(font & 8)])
        }
      }
    }
  })
})
