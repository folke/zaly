import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"
import { validateTheme } from "../../src/schemas/theme.ts"
import { resolveStyle } from "../../src/style/style.ts"
import { defaultTheme, loadTheme, themeRegistry } from "../../src/themes/registry.ts"

// Without a terminal, the system theme starts with the plain ANSI strategy.
const system = await loadTheme("system")

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

describe("theme part slots — system", () => {
  test("border slot defined", () => {
    expect(system.border).toBeDefined()
  })

  test("borderTitle slot defined", () => {
    expect(system.borderTitle).toBeDefined()
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

describe("theme markdown slots — system", () => {
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
    for (const k of slots) expect(system[k]).toBeDefined()
  })
})

describe("built-in themes — load & validate", () => {
  // Every bundled theme surfaces via the registry.
  const names = themeRegistry.keys()

  // `resolveTheme` skips validation for the hot path — built-in
  // theme JSON is dev-controlled, so the standalone validator can
  // stay off the main startup path. The correctness
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

// Validate overrides against a complete theme, so failures test the value rather
// than an unrelated missing required slot. Appearance is inferred from the background.
const custom = Object.fromEntries(
  Object.entries(defaultTheme).filter(([key]) => key !== "appearance")
)
const validateOverrides = (overrides: Record<string, unknown>) =>
  validateTheme({ ...custom, ...overrides })

describe("validateTheme — positive cases", () => {
  test("accepts overrides when the required palette is present", () => {
    expect(() => validateOverrides({})).not.toThrow()
  })

  test("rejects themes without required palette fields", () => {
    expect(() => validateTheme({})).toThrow()
    expect(() => validateTheme({ primary: "#ff00ff" })).toThrow()
  })

  test("inherit accepted", () => {
    expect(() => validateOverrides({ fg: "inherit" })).not.toThrow()
  })

  test("hex forms (#rgb / #rrggbb / #rrggbbaa) accepted", () => {
    expect(() =>
      validateOverrides({ fg: "#fff", bg: "#112233", primary: "#11223344" })
    ).not.toThrow()
  })

  test("slot ref accepted as a Color", () => {
    expect(() => validateOverrides({ accent: "primary" })).not.toThrow()
  })

  test("lightness modifier accepted on hex and slot", () => {
    // `<base>+N` lightens, `<base>-N` darkens (OKLCH percentage points).
    expect(() => validateOverrides({ accent: "primary+10", primary: "#ff0000-25" })).not.toThrow()
  })

  test("Style slot accepts fg/bg + attrs", () => {
    expect(() =>
      validateOverrides({ title: { bold: true, fg: "primary", bg: "muted-10" } })
    ).not.toThrow()
  })

  test("unknown plugin slots are accepted (extensibility)", () => {
    expect(() =>
      validateOverrides({ pluginThing: "primary", pluginStyle: { italic: true, fg: "error" } })
    ).not.toThrow()
  })

  test("shiki slot carries a theme-name string, not a Color", () => {
    expect(() => validateOverrides({ shiki: "catppuccin-mocha" })).not.toThrow()
  })

  test("$schema passes through unchecked", () => {
    expect(() => validateOverrides({ $schema: "./schema.json" })).not.toThrow()
  })
})

describe("validateTheme — negative cases", () => {
  const ansiNames = [
    "black",
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
    "gray",
    "grey",
  ]
  test.each(ansiNames.flatMap((name) => [name, `bright${name[0].toUpperCase()}${name.slice(1)}`]))(
    "rejects ANSI color %s in JSON themes",
    (color) => {
      for (const overrides of [
        { primary: color },
        { fg: color },
        { bg: color },
        { title: color },
        { title: { fg: color } },
        { title: { bg: color } },
        { pluginSlot: color },
        { pluginStyle: { fg: color } },
      ])
        expect(() => validateOverrides(overrides)).toThrow(/Invalid theme/)
    }
  )

  test("wrong type at a slot throws", () => {
    expect(() => validateOverrides({ primary: 42 as never })).toThrow(/primary/)
  })

  test.each(["#abcd", "#12345678"])("accepts valid alpha hex colors: %s", (color) => {
    expect(() => validateOverrides({ primary: color })).not.toThrow()
  })

  test.each(["#12", "#12345", "#1234567", "#ggg", "#123456789"])(
    "rejects malformed hex colors: %s",
    (color) => {
      expect(() => validateOverrides({ primary: color })).toThrow(/primary/)
    }
  )

  test("validation reports missing and extra fields without changing the input", () => {
    const input = { ...custom, title: { bold: true, typo: true } }
    expect(() => validateTheme(input)).toThrow(/title\/typo/)
    expect(input.title.typo).toBe(true)
    expect(() => validateTheme({})).toThrow(/\/id/)
  })

  test("invalid Color string at a slot throws", () => {
    expect(() => validateOverrides({ primary: "not-a-color" as never })).toThrow(/primary/)
  })

  test("color-only slot rejects a Style object", () => {
    // `primary` is one of the Color-typed slots (ColorKeys<Theme>); a
    // Style shape here should trip the isColorKey narrowing.
    expect(() => validateOverrides({ primary: { bold: true, fg: "primary" } as never })).toThrow()
  })

  test("malformed lightness modifier rejected", () => {
    // The lightness suffix must be `+/-<number>`; anything else (extra
    // sign, non-numeric, missing digits) trips the Color narrowing.
    expect(() => validateOverrides({ primary: "primary++10" as never })).toThrow()
    expect(() => validateOverrides({ primary: "primary+abc" as never })).toThrow()
    expect(() => validateOverrides({ primary: "primary+" as never })).toThrow()
  })

  test("invalid fg inside a Style rejected", () => {
    expect(() => validateOverrides({ title: { bold: true, fg: "not-a-color" } as never })).toThrow()
  })

  test("invalid bg inside a Style rejected", () => {
    expect(() =>
      validateOverrides({ title: { fg: "primary", bg: "not-a-color" } as never })
    ).toThrow()
  })

  test("non-string $schema rejected", () => {
    expect(() => validateOverrides({ $schema: 42 as never })).toThrow()
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

  test("loads system", async () => {
    const t = await loadTheme("system")
    expect(t.primary).toBe(system.primary)
  })

  test("unknown theme name throws with the search paths listed", async () => {
    await expect(loadTheme("does-not-exist")).rejects.toThrow(/not found/)
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
