import type { TerminalPaletteSnapshot } from "../../src/input/queries.ts"

import { describe, expect, test } from "vitest"
import { openStyle } from "../../src/style/style.ts"
import { loadTheme, themeRegistry } from "../../src/themes/registry.ts"
import { systemTheme } from "../../src/themes/system.ts"

const snapshot: TerminalPaletteSnapshot = {
  ansi: Array.from({ length: 16 }, (_, i) => `#${i.toString(16).repeat(6)}` as const),
  bg: "#181818",
  fg: "#eeeeee",
}

describe("automatic system theme", () => {
  test("is listed and loads without terminal access", async () => {
    expect(themeRegistry.has("system")).toBe(true)
    expect(await loadTheme("system")).toMatchObject({ id: "system", bg: "inherit", fg: "inherit" })
  })

  test("prefers the complete captured palette", () => {
    const theme = systemTheme(snapshot)
    expect(theme.id).toBe("system")
    expect(openStyle({ fg: "primary" }, theme)).toBe(openStyle({ fg: "#444444" }))
    expect(theme.bg).toBe(snapshot.bg)
    expect(theme.fg).toBe(snapshot.fg)
  })

  test("uses background-aware live ANSI when even one palette entry is absent", () => {
    const theme = systemTheme({
      ...snapshot,
      ansi: [...snapshot.ansi.slice(0, 15), undefined],
      bg: "#ffffff",
    })
    expect(theme.appearance).toBe("light")
    expect(theme.shiki).toBe("auto")
    expect(theme.ui).toEqual({ bg: "bg-3" })
    expect(openStyle({ fg: "primary" }, theme)).toBe(openStyle({ fg: "blue" }))
  })

  test("background alone is sufficient for surfaces", () => {
    const theme = systemTheme({ ansi: [], bg: "#eeeeee" })
    expect(theme).toMatchObject({ bg: "#eeeeee", fg: "inherit", appearance: "light" })
  })

  test("without a background uses ANSI, not fabricated RGB colors", () => {
    const theme = systemTheme({ ...snapshot, bg: undefined }, "light")
    expect(theme).toMatchObject({
      bg: "inherit",
      fg: "inherit",
      appearance: "light",
      selection: { inverse: true },
    })
    expect(theme.ui).toEqual({})
  })

  test("classifies the actual background over a conflicting appearance report", () => {
    expect(systemTheme(snapshot, "light").appearance).toBe("dark")
  })
})
