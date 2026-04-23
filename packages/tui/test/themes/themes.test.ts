import type { ThemeName } from "../../src/themes/index.ts"

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { validateTheme } from "../../src/schemas/index.ts"
import { resolveStyle } from "../../src/style/color.ts"
import { defaultTheme, loadTheme, loadThemeFile } from "../../src/style/theme.ts"
import { themes } from "../../src/themes/index.ts"

// ansi is no longer a static export; load it for the comparison tests below.
const ansi = await loadTheme("ansi")

describe("theme part slots — moon", () => {
  test("border slot defined", () => {
    expect(defaultTheme.border).toBeDefined()
  })

  test("borderTitle slot defined", () => {
    expect(defaultTheme.borderTitle).toBeDefined()
  })

  test("border resolves to a Style via resolveStyle", () => {
    const s = resolveStyle("border", defaultTheme)
    expect(s.fg).toBeDefined()
  })
})

describe("theme part slots — ansi", () => {
  test("border slot defined", () => {
    expect(ansi.border).toBeDefined()
  })

  test("borderTitle slot defined", () => {
    expect(ansi.borderTitle).toBeDefined()
  })
})

describe("theme markdown slots — moon", () => {
  test("all md* slots defined", () => {
    const slots = [
      "mdHeading1",
      "mdHeading2",
      "mdHeading3",
      "mdHeading4",
      "mdHeading5",
      "mdHeading6",
      "mdBold",
      "mdItalic",
      "mdStrikethrough",
      "mdCode",
      "mdCodeBlock",
      "mdLink",
      "mdQuote",
      "mdListBullet",
      "mdListChecked",
      "mdListUnchecked",
      "mdHr",
      "mdTable",
      "mdTableHeader",
    ] as const
    for (const k of slots) expect(defaultTheme[k]).toBeDefined()
  })

  test("mdBold defaults to bold", () => {
    expect(defaultTheme.mdBold).toMatchObject({ bold: true })
  })

  test("mdItalic defaults to italic", () => {
    expect(defaultTheme.mdItalic).toMatchObject({ italic: true })
  })

  test("mdStrikethrough has strikethrough attr", () => {
    expect(defaultTheme.mdStrikethrough).toMatchObject({ strikethrough: true })
  })
})

describe("theme markdown slots — ansi", () => {
  test("all md* slots defined", () => {
    const slots = [
      "mdHeading1",
      "mdBold",
      "mdItalic",
      "mdCode",
      "mdCodeBlock",
      "mdLink",
      "mdHr",
    ] as const
    for (const k of slots) expect(ansi[k]).toBeDefined()
  })
})

describe("built-in themes — load & validate", () => {
  // Every bundled theme surfaces via the `themes` async loader map.
  // Awaiting the loader runs `resolveTheme` (and therefore typia's
  // `validateTheme`) on the raw JSON — if any shipped theme drifted
  // out of sync with the schema, the load itself throws.
  const names = Object.keys(themes) as ThemeName[]

  test("map includes the tokyonight family", () => {
    expect(names).toEqual(
      expect.arrayContaining([
        "tokyonight-day",
        "tokyonight-moon",
        "tokyonight-night",
        "tokyonight-storm",
      ])
    )
  })

  for (const name of names) {
    test(`${name} loads and has core slots`, async () => {
      const theme = await themes[name]()
      expect(theme.primary).toBeDefined()
      expect(theme.border).toBeDefined()
      expect(theme.mdHeading1).toBeDefined()
    })
  }
})

describe("validateTheme — positive cases", () => {
  test("empty object is accepted (every slot is optional in JSON)", () => {
    expect(() => validateTheme({})).not.toThrow()
  })

  test("partial theme (only some slots) is accepted", () => {
    expect(() => validateTheme({ primary: "#ff00ff" })).not.toThrow()
  })
})

describe("validateTheme — negative cases", () => {
  test("extra property throws (createAssertEquals is strict)", () => {
    expect(() => validateTheme({ ...defaultTheme, bogusExtra: "nope" })).toThrow()
  })

  test("wrong type at a slot throws", () => {
    expect(() => validateTheme({ primary: 42 as never })).toThrow(/primary/)
  })

  test("invalid Color string at a slot throws", () => {
    expect(() => validateTheme({ primary: "not-a-color" as never })).toThrow(/primary/)
  })
})

describe("loadTheme", () => {
  test("loads a built-in theme by name", async () => {
    const t = await loadTheme("tokyonight-moon")
    // Round-trip parity: static moon and loaded moon agree on core slots.
    expect(t.primary).toBe(defaultTheme.primary)
    expect(t.mdHeading1).toEqual(defaultTheme.mdHeading1)
  })

  test("default name is tokyonight-moon", async () => {
    const t = await loadTheme()
    expect(t.primary).toBe(defaultTheme.primary)
  })

  test("loads ansi", async () => {
    const t = await loadTheme("ansi")
    expect(t.primary).toBe(ansi.primary)
  })

  test("unknown theme name throws with the search paths listed", async () => {
    await expect(loadTheme("does-not-exist")).rejects.toThrow(/not found/)
  })

  describe("with user dirs", () => {
    let dir: string
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "zaly-themes-"))
      // Minimal complete theme copied from moon, plus a marker we can assert on.
      writeFileSync(
        join(dir, "custom.json"),
        JSON.stringify({ ...defaultTheme, primary: "#ff00ff" }, undefined, 2)
      )
      // Same name as a built-in to test override precedence.
      writeFileSync(
        join(dir, "tokyonight-moon.json"),
        JSON.stringify({ ...defaultTheme, primary: "#123456" }, undefined, 2)
      )
    })
    afterAll(() => rmSync(dir, { force: true, recursive: true }))

    test("user dir resolves a custom theme", async () => {
      const t = await loadTheme("custom", { dirs: [dir] })
      expect(t.primary).toBe("#ff00ff")
    })

    test("user dir takes precedence over built-in for same name", async () => {
      const t = await loadTheme("tokyonight-moon", { dirs: [dir] })
      expect(t.primary).toBe("#123456")
    })

    test("falls back to built-in when user dirs miss", async () => {
      const t = await loadTheme("ansi", { dirs: [dir] })
      expect(t.primary).toBe(ansi.primary)
    })

    test("invalid theme JSON in user dir throws", async () => {
      // Bad value (non-Color string) — triggers typia's value-level check.
      writeFileSync(
        join(dir, "broken.json"),
        JSON.stringify({ primary: "not-a-color" }, undefined, 2)
      )
      await expect(loadTheme("broken", { dirs: [dir] })).rejects.toThrow()
    })
  })
})

describe("loadThemeFile", () => {
  // The bundled JSON lives at `<pkg>/assets/themes/*.json` and is
  // still readable directly for the file-loader path used by CLIs
  // that accept an explicit `--theme /path/to/foo.json` flag.
  // `import.meta.resolve` returns a `file://` URL; convert to a plain
  // fs path so `loadThemeFile` (which uses `readFileSync`) is happy on
  // both Bun and Node.
  const assetPath = fileURLToPath(
    import.meta.resolve("../../assets/themes/tokyonight-moon.json"),
  )

  test("loads a theme directly by path", () => {
    const t = loadThemeFile(assetPath)
    expect(t.primary).toBe(defaultTheme.primary)
  })

  test("unknown path throws", () => {
    expect(() => loadThemeFile("/nope/does-not-exist.json")).toThrow()
  })
})
