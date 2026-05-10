import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { validateTheme } from "../../src/schemas/index.ts"
import { resolveStyle } from "../../src/style/style.ts"
import { defaultTheme, loadTheme, themeRegistry } from "../../src/themes/index.ts"

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
  // Every bundled theme surfaces via the registry.
  const names = themeRegistry.keys()

  // `resolveTheme` skips validation for the hot path — built-in
  // theme JSON is dev-controlled, and typia's generated assertions
  // would drag ~3MB of code into module load. The correctness
  // contract is covered here instead: every shipped JSON is
  // validated explicitly so schema drift still fails the build.
  const assetsDir = fileURLToPath(import.meta.resolve("../../assets/themes/"))
  const jsonFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".json"))

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

  for (const file of jsonFiles) {
    test(`${file} validates against the Theme schema`, () => {
      const raw = JSON.parse(readFileSync(join(assetsDir, file), "utf8"))
      expect(() => validateTheme(raw)).not.toThrow()
    })
  }

  for (const name of names) {
    test(`${name} loads and has core slots`, async () => {
      // `loadTheme` (not `themeRegistry.load`) is the public path —
      // the registry now stores `Partial<Theme>`, so defaults only fill
      // in once `resolveTheme` runs inside `loadTheme`.
      const theme = await loadTheme(name)
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

  test("ANSI names and bright variants accepted", () => {
    expect(() => validateTheme({ primary: "red", accent: "brightCyan" })).not.toThrow()
  })

  test("inherit accepted", () => {
    expect(() => validateTheme({ fg: "inherit" })).not.toThrow()
  })

  test("hex forms (#rgb / #rrggbb / #rrggbbaa) accepted", () => {
    expect(() => validateTheme({ fg: "#fff", bg: "#112233", primary: "#11223344" })).not.toThrow()
  })

  test("slot ref accepted as a Color", () => {
    expect(() => validateTheme({ accent: "primary" })).not.toThrow()
  })

  test("lightness modifier accepted on hex and slot", () => {
    // `<base>+N` lightens, `<base>-N` darkens (OKLCH percentage points).
    expect(() => validateTheme({ accent: "primary+10", primary: "#ff0000-25" })).not.toThrow()
  })

  test("Style slot accepts fg/bg + attrs", () => {
    expect(() =>
      validateTheme({ title: { bold: true, fg: "primary", bg: "muted-10" } })
    ).not.toThrow()
  })

  test("unknown plugin slots are accepted (extensibility)", () => {
    expect(() =>
      validateTheme({ pluginThing: "primary", pluginStyle: { italic: true, fg: "red" } })
    ).not.toThrow()
  })

  test("shiki slot carries a theme-name string, not a Color", () => {
    expect(() => validateTheme({ shiki: "catppuccin-mocha" })).not.toThrow()
  })

  test("$schema passes through unchecked", () => {
    expect(() => validateTheme({ $schema: "./schema.json" })).not.toThrow()
  })
})

describe("validateTheme — negative cases", () => {
  test("wrong type at a slot throws", () => {
    expect(() => validateTheme({ primary: 42 as never })).toThrow(/primary/)
  })

  test("invalid Color string at a slot throws", () => {
    expect(() => validateTheme({ primary: "not-a-color" as never })).toThrow(/primary/)
  })

  test("color-only slot rejects a Style object", () => {
    // `primary` is one of the Color-typed slots (ColorKeys<Theme>); a
    // Style shape here should trip the isColorKey narrowing.
    expect(() => validateTheme({ primary: { bold: true, fg: "red" } as never })).toThrow()
  })

  test("malformed lightness modifier rejected", () => {
    // The lightness suffix must be `+/-<number>`; anything else (extra
    // sign, non-numeric, missing digits) trips the Color narrowing.
    expect(() => validateTheme({ primary: "primary++10" as never })).toThrow()
    expect(() => validateTheme({ primary: "primary+abc" as never })).toThrow()
    expect(() => validateTheme({ primary: "primary+" as never })).toThrow()
  })

  test("invalid fg inside a Style rejected", () => {
    expect(() => validateTheme({ title: { bold: true, fg: "not-a-color" } as never })).toThrow()
  })

  test("invalid bg inside a Style rejected", () => {
    expect(() => validateTheme({ title: { fg: "primary", bg: "not-a-color" } as never })).toThrow()
  })

  test("non-string $schema rejected", () => {
    expect(() => validateTheme({ $schema: 42 as never })).toThrow()
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
      const t = await loadTheme({ name: "custom", dirs: [dir] })
      expect(t.primary).toBe("#ff00ff")
    })

    test("user dir takes precedence over built-in for same name", async () => {
      const t = await loadTheme({ name: "tokyonight-moon", dirs: [dir] })
      expect(t.primary).toBe("#123456")
    })

    test("falls back to built-in when user dirs miss", async () => {
      const t = await loadTheme({ name: "ansi", dirs: [dir] })
      expect(t.primary).toBe(ansi.primary)
    })

    test("invalid theme JSON in user dir throws", async () => {
      // Bad value (non-Color string) — triggers typia's value-level check.
      writeFileSync(
        join(dir, "broken.json"),
        JSON.stringify({ primary: "not-a-color" }, undefined, 2)
      )
      await expect(loadTheme({ name: "broken", dirs: [dir] })).rejects.toThrow()
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
  const assetPath = fileURLToPath(import.meta.resolve("../../assets/themes/tokyonight-moon.json"))

  test("loads a theme directly by path", async () => {
    const t = await loadTheme({ path: assetPath })
    expect(t.primary).toBe(defaultTheme.primary)
  })

  test("unknown path throws", async () => {
    await expect(loadTheme({ path: "/nope/does-not-exist.json" })).rejects.toThrow()
  })
})
