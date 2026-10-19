import type { Scheme, SchemeColor } from "../../scripts/themes-iterm2.ts"
import type { HexColor, Style } from "../../src/style/types.ts"
import type { TerminalPalette } from "../../src/themes/system.ts"

import { describe, expect, test } from "vitest"
import { paletteFromScheme } from "../../scripts/themes-iterm2.ts"
import { validateTheme } from "../../src/schemas/gen/theme.config.ts"
import { blend } from "../../src/style/color.ts"
import { hexToOklch } from "../../src/style/oklch.ts"
import { openStyle } from "../../src/style/style.ts"
import { defaultsDark, defaultsLight } from "../../src/themes/default.ts"
import { themeFromPalette } from "../../src/themes/system.ts"

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
    expect(theme.primary).toBe("blue")
    expect(openStyle({ fg: "primary" }, current)).toBe(openStyle({ fg: ansi[4] }))
    expect(openStyle({ fg: "accent" }, current)).toBe(openStyle({ fg: ansi[13] }))
    expect(openStyle({ fg: "syntaxString" }, current)).toBe(openStyle({ fg: ansi[2] }))
    expect(openStyle({ fg: "gray" }, current)).toBe(openStyle({ fg: ansi[8] }))
    expect(openStyle({ fg: "brightGrey" }, current)).toBe(openStyle({ fg: ansi[8] }))
    expect(theme.syntaxField).toBe("fg")
    expect(JSON.stringify(defaultsDark)).toBe(before)
  })

  test.each([
    { bg: "#181818", fg: "#dddddd", mode: "dark" },
    { bg: "#fafafa", fg: "#222222", mode: "light" },
  ] as const)("derives $mode surfaces and diff backgrounds", ({ bg, fg, mode }) => {
    const theme = themeFromPalette({ ansi, bg, fg })
    expect(theme.mode).toBe(mode)
    expect(theme.ui).toEqual((mode === "dark" ? defaultsDark : defaultsLight).ui)
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
      expect(mode === "dark" ? l > bgL : l < bgL).toBe(true)
    }
  })

  test("honors explicit mode and source selection colors", () => {
    const theme = themeFromPalette({
      ...palette,
      mode: "light",
      selectionBg: "#112233",
      selectionFg: "#abcdef",
    })
    expect(theme.mode).toBe("light")
    expect(theme.selection).toEqual({ bg: "#112233", fg: "#abcdef" })
    expect(themeFromPalette({ ...palette, selectionBg: "#112233" }).selection).toEqual({
      bg: "#112233",
      fg: palette.fg,
    })
  })

  test("theme files reject invalid explicit modes", () => {
    expect(() => validateTheme({ id: "invalid", mode: "sepia" })).toThrow()
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
    expect(themeFromPalette(actual).mode).toBe("light")
  })

  test("honors explicit source classification", () => {
    expect(paletteFromScheme({ ...scheme(), Dark_Theme: false }).mode).toBe("light")
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
