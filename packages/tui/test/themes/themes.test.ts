import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { validateTheme } from "../../src/schemas/gen/theme.config.ts"
import { resolveStyle } from "../../src/style/compose.ts"
import { builtinThemeDir, loadTheme, loadThemeFile, moon } from "../../src/style/theme.ts"

// ansi is no longer a static export; load it for the comparison tests below.
const ansi = loadTheme("ansi")

describe("theme part slots — moon", () => {
  test("border slot defined", () => {
    expect(moon.border).toBeDefined()
  })

  test("borderTitle slot defined", () => {
    expect(moon.borderTitle).toBeDefined()
  })

  test("border resolves to a Style via resolveStyle", () => {
    const s = resolveStyle("border", moon)
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
      "mdStrong",
      "mdEmphasis",
      "mdStrikethrough",
      "mdCode",
      "mdCodeBlock",
      "mdLink",
      "mdBlockquote",
      "mdList",
      "mdListChecked",
      "mdListUnchecked",
      "mdHr",
      "mdTable",
      "mdTableHeader",
    ] as const
    for (const k of slots) expect(moon[k]).toBeDefined()
  })

  test("mdStrong defaults to bold", () => {
    expect(moon.mdStrong).toMatchObject({ bold: true })
  })

  test("mdEmphasis defaults to italic", () => {
    expect(moon.mdEmphasis).toMatchObject({ italic: true })
  })

  test("mdStrikethrough has strikethrough attr", () => {
    expect(moon.mdStrikethrough).toMatchObject({ strikethrough: true })
  })
})

describe("theme markdown slots — ansi", () => {
  test("all md* slots defined", () => {
    const slots = [
      "mdHeading1",
      "mdStrong",
      "mdEmphasis",
      "mdCode",
      "mdCodeBlock",
      "mdLink",
      "mdHr",
    ] as const
    for (const k of slots) expect(ansi[k]).toBeDefined()
  })
})

describe("validateTheme — built-in assets", () => {
  // Resolve the on-disk theme dir the same way loadTheme does, but read
  // files directly so this test exercises validateTheme without going
  // through the loader (catches regressions where a shipped theme stops
  // matching the generated schema for structural reasons).
  const themesDir = builtinThemeDir
  const files = readdirSync(themesDir)
    .filter((f) => f.endsWith(".json"))
    .toSorted()

  test("asset dir contains at least moon, storm, night, day, ansi", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "ansi.json",
        "tokyonight-day.json",
        "tokyonight-moon.json",
        "tokyonight-night.json",
        "tokyonight-storm.json",
      ])
    )
  })

  for (const file of files) {
    test(`${file} passes validateTheme`, () => {
      const raw = readFileSync(join(themesDir, file), "utf8")
      const data = JSON.parse(raw) as Record<string, unknown>
      // Loader strips `$schema` before validating; do the same so the
      // equality check isn't tripped by a known-extra field.
      delete data.$schema
      expect(() => validateTheme(data)).not.toThrow()
    })
  }
})

describe("validateTheme — negative cases", () => {
  test("missing required field throws", () => {
    const { mdHeading: _omit, ...incomplete } = moon
    expect(() => validateTheme(incomplete)).toThrow(/mdHeading/)
  })

  test("extra property throws (createAssertEquals is strict)", () => {
    expect(() => validateTheme({ ...moon, bogusExtra: "nope" })).toThrow()
  })

  test("wrong type at a slot throws", () => {
    expect(() => validateTheme({ ...moon, primary: 42 as never })).toThrow(/primary/)
  })
})

describe("loadTheme", () => {
  test("loads a built-in theme from assets/themes/*.json", () => {
    const t = loadTheme("tokyonight-moon")
    // Round-trip parity: static moon and loaded moon agree on all keys.
    expect(t.primary).toBe(moon.primary)
    expect(t.mdHeading1).toEqual(moon.mdHeading1)
  })

  test("default name is tokyonight-moon", () => {
    expect(loadTheme().primary).toBe(moon.primary)
  })

  test("loads ansi", () => {
    expect(loadTheme("ansi").primary).toBe(ansi.primary)
  })

  test("unknown theme name throws with the search paths listed", () => {
    expect(() => loadTheme("does-not-exist")).toThrow(/not found/)
  })

  describe("with user dirs", () => {
    let dir: string
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), "zaly-themes-"))
      // Minimal complete theme copied from moon, plus a marker we can assert on.
      writeFileSync(
        join(dir, "custom.json"),
        JSON.stringify({ ...moon, primary: "#ff00ff" }, undefined, 2)
      )
      // Same name as built-in to test override precedence.
      writeFileSync(
        join(dir, "tokyonight-moon.json"),
        JSON.stringify({ ...moon, primary: "#123456" }, undefined, 2)
      )
    })
    afterAll(() => rmSync(dir, { force: true, recursive: true }))

    test("user dir resolves a custom theme", () => {
      expect(loadTheme("custom", { dirs: [dir] }).primary).toBe("#ff00ff")
    })

    test("user dir takes precedence over built-in for same name", () => {
      expect(loadTheme("tokyonight-moon", { dirs: [dir] }).primary).toBe("#123456")
    })

    test("falls back to built-in when user dirs miss", () => {
      expect(loadTheme("ansi", { dirs: [dir] }).primary).toBe(ansi.primary)
    })

    test("invalid theme JSON in user dir throws", () => {
      writeFileSync(join(dir, "broken.json"), JSON.stringify({ fg: "red" }, undefined, 2))
      expect(() => loadTheme("broken", { dirs: [dir] })).toThrow()
    })
  })
})

describe("loadThemeFile", () => {
  test("loads a theme directly by path", () => {
    const t = loadThemeFile(join(builtinThemeDir, "tokyonight-moon.json"))
    expect(t.primary).toBe(moon.primary)
  })

  test("unknown path throws", () => {
    expect(() => loadThemeFile("/nope/does-not-exist.json")).toThrow()
  })
})
