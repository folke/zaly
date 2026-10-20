import type { Scheme, SchemeColor } from "../../scripts/themes-iterm2.ts"
import type { Color, HexColor, Style } from "../../src/style/types.ts"
import type { TerminalPalette } from "../../src/themes/system.ts"

import { describe, expect, test } from "vitest"
import { paletteFromScheme } from "../../scripts/themes-iterm2.ts"
import { validateTheme } from "../../src/schemas/theme.ts"
import { blend } from "../../src/style/color.ts"
import { hexToOklch } from "../../src/style/oklch.ts"
import { openStyle } from "../../src/style/style.ts"
import { defaultsDark, defaultsLight } from "../../src/themes/default.ts"
import { internalizePalette, themeFromPalette } from "../../src/themes/system.ts"

const ansi: HexColor[] = [
  "#111111",
  "#cc3333",
  "#33aa55",
  "#ccaa33",
  "#3377cc",
  "#aa55cc",
  "#33aaaa",
  "#bbbbbb",
  "#777777",
  "#ff5555",
  "#55dd77",
  "#ffdd55",
  "#5599ff",
  "#cc77ff",
  "#55dddd",
  "#eeeeee",
]
const palette: TerminalPalette = { ansi, bg: "#181818", fg: "#dddddd" }

describe("terminal palette themes", () => {
  test("maps ANSI slots to fixed palette colors without mutating defaults", () => {
    const before = JSON.stringify(defaultsDark)
    const theme = themeFromPalette(palette)
    const current = { ...theme, id: "palette" }
    expect(theme).not.toHaveProperty("id")
    expect(theme).not.toHaveProperty("name")
    expect(theme.primary).toBe(ansi[4])
    expect(openStyle({ fg: "primary" }, current)).toBe(openStyle({ fg: ansi[4] }))
    expect(openStyle({ fg: "accent" }, current)).toBe(openStyle({ fg: ansi[13] }))
    expect(openStyle({ fg: "syntaxString" }, current)).toBe(openStyle({ fg: ansi[2] }))
    expect(openStyle({ fg: "gray" }, current)).toBe(openStyle({ fg: ansi[8] }))
    expect(openStyle({ fg: "brightGrey" }, current)).toBe(openStyle({ fg: ansi[8] }))
    expect(theme.syntaxField).toBe("fg")
    expect(JSON.stringify(defaultsDark)).toBe(before)
  })

  test("internalizes palette bases without evaluating adjustments or semantic references", () => {
    const theme = {
      ...themeFromPalette(palette),
      appearance: "dark",
      name: "blue",
      shiki: "red",
      primary: "brightBlue+51" as Color,
      accent: "primary+5",
      title: { bold: true, fg: "brightBlue-10" as Color, bg: "blue+05" as Color },
      syntaxString: "green",
    } as const
    const before = JSON.stringify(theme)
    const result = internalizePalette(
      theme,
      new Map([
        ["blue", ansi[4]],
        ["brightBlue", ansi[12]],
        ["green", ansi[2]],
      ])
    )
    expect(result.primary).toBe(`${ansi[12]}+51`)
    expect(result.accent).toBe("primary+5")
    expect(result.title).toEqual({ bold: true, fg: `${ansi[12]}-10`, bg: `${ansi[4]}+05` })
    expect(result.syntaxString).toBe(ansi[2])
    expect(result.name).toBe("blue")
    expect(result.shiki).toBe("red")
    expect(result.appearance).toBe("dark")
    expect(JSON.stringify(theme)).toBe(before)
    expect(openStyle({ fg: "primary" }, { ...result, id: "rgb" })).toBe(
      openStyle({ fg: "primary" }, { ...theme, id: "palette" })
    )
    expect(openStyle({ fg: "accent" }, { ...result, id: "rgb" })).toBe(
      openStyle({ fg: "accent" }, { ...theme, id: "palette" })
    )
    expect(openStyle({ style: "title" }, { ...result, id: "rgb" })).toBe(
      openStyle({ style: "title" }, { ...theme, id: "palette" })
    )
    expect(validateTheme({ ...result, id: "export" })).toEqual({ ...result, id: "export" })
  })

  test.each([
    { bg: "#181818", fg: "#dddddd", appearance: "dark" },
    { bg: "#fafafa", fg: "#222222", appearance: "light" },
  ] as const)("derives $appearance surfaces and diff backgrounds", ({ bg, fg, appearance }) => {
    const theme = themeFromPalette({ ansi, bg, fg })
    expect(theme.appearance).toBe(appearance)
    expect(theme.ui).toEqual((appearance === "dark" ? defaultsDark : defaultsLight).ui)
    expect(theme.selection).toEqual({ bg: blend(ansi[12], bg, 0.3) })
    const bgL = hexToOklch(bg).L
    const mutedL = hexToOklch(theme.muted as HexColor).L
    expect(mutedL).toBeGreaterThan(Math.min(bgL, hexToOklch(fg).L))
    expect(mutedL).toBeLessThan(Math.max(bgL, hexToOklch(fg).L))
    for (const [diff, accent] of [
      [theme.diffAdd, ansi[2]],
      [theme.diffDel, ansi[1]],
    ] as const) {
      expect((diff as Style).bg).toBe(blend(accent, bg, 0.2))
      const l = hexToOklch((diff as Style).bg as HexColor).L
      expect(appearance === "dark" ? l > bgL : l < bgL).toBe(true)
    }
  })

  test("honors explicit appearance and source selection colors", () => {
    const theme = themeFromPalette({
      ...palette,
      appearance: "light",
      selectionBg: "#112233",
      selectionFg: "#abcdef",
    })
    expect(theme.appearance).toBe("light")
    expect(theme.selection).toEqual({ bg: "#112233", fg: "#abcdef" })
    expect(themeFromPalette({ ...palette, selectionBg: "#112233" }).selection).toEqual({
      bg: "#112233",
      fg: undefined,
    })
  })

  test.each(["dark", "light"] as const)(
    "theme files accept explicit %s appearance",
    (appearance) => {
      const theme = { ...themeFromPalette(palette), id: "test", appearance }
      expect(validateTheme(theme).appearance).toBe(appearance)
    }
  )

  test("theme files reject invalid appearance values", () => {
    expect(() =>
      validateTheme({ ...themeFromPalette(palette), id: "invalid", appearance: "sepia" })
    ).toThrow()
  })

  test("requires exactly sixteen colors", () => {
    expect(() => themeFromPalette({ ...palette, ansi: ansi.slice(1) })).toThrow("16")
  })
})

function scheme(): Scheme {
  const color = (hex: string) => ({ hex }) as SchemeColor
  return {
    scheme_name: "Test scheme",
    colors: {
      ...Object.fromEntries(ansi.map((hex, i) => [`Ansi ${i} Color`, color(hex.slice(1))])),
      "Background Color": color("181818"),
      "Foreground Color": color("DDDDDD"),
    } as Scheme["colors"],
  }
}

describe("iTerm2 scheme adapter", () => {
  test("converts nested source colors and normalizes hex", () => {
    const actual = paletteFromScheme(scheme())
    expect(actual.ansi).toEqual(ansi)
    expect(actual.bg).toBe(palette.bg)
    expect(actual.fg).toBe(palette.fg)
  })

  test("uses appearance overrides with per-color fallback", () => {
    const source = scheme()
    source.colors["Background Color (Light)"] = { hex: "ffffff" } as SchemeColor
    const actual = paletteFromScheme(source, "Light")
    expect(actual.bg).toBe("#ffffff")
    expect(actual.ansi).toEqual(ansi)
    expect(themeFromPalette(actual).appearance).toBe("light")
  })

  test("honors explicit source classification", () => {
    expect(paletteFromScheme({ ...scheme(), Dark_Theme: false }).appearance).toBe("light")
  })

  test("rejects missing or malformed required colors", () => {
    const source = scheme()
    source.colors["Foreground Color"] = { hex: "invalid" } as SchemeColor
    expect(() => paletteFromScheme(source)).toThrow("Foreground Color")
    expect(() =>
      paletteFromScheme({ scheme_name: "Empty", colors: {} as Scheme["colors"] })
    ).toThrow("Ansi 0 Color")
  })
})
