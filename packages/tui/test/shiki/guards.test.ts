import { bundledLanguagesInfo } from "shiki/langs"
import { bundledThemesInfo } from "shiki/themes"
import { expect, test } from "vitest"
import { isShikiLang, isShikiTheme } from "../../src/schemas/shiki.ts"

test("language guards include every bundled language and alias", () => {
  for (const { id, aliases } of bundledLanguagesInfo) {
    expect(isShikiLang(id)).toBe(true)
    for (const alias of aliases ?? []) expect(isShikiLang(alias)).toBe(true)
  }
})

test("theme guards include every bundled Shiki theme", () => {
  for (const { id } of bundledThemesInfo) expect(isShikiTheme(id)).toBe(true)
})

// oxlint-disable-next-line unicorn/no-null
test.each([undefined, null, false, 1, {}, [], "not-a-shiki-id"].map((input) => ({ input })))(
  "guards reject %j",
  ({ input }) => {
    expect(isShikiLang(input)).toBe(false)
    expect(isShikiTheme(input)).toBe(false)
  }
)
