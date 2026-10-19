import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { shiki } from "../../src/shiki/api.ts"
import { shikiTheme } from "../../src/shiki/theme.ts"
import { openAnsi } from "../../src/style/ansi.ts"
import { loadTheme } from "../../src/themes/registry.ts"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "zaly-iterm2-"))
  dirs.push(dir)
  const input = join(dir, "schemes.jsonl")
  const output = join(dir, "themes")
  const scheme = (name: string, dark: boolean) => ({
    scheme_name: name,
    Dark_Theme: dark,
    author: "Test author",
    colors: {
      ...Object.fromEntries(
        Array.from({ length: 16 }, (_, i) => [`Ansi ${i} Color`, { hex: "80ff80" }])
      ),
      "Background Color": { hex: dark ? "181818" : "eeeeee" },
      "Foreground Color": { hex: dark ? "eeeeee" : "181818" },
      "Background Color (Light)": { hex: "ffffff" },
      "Foreground Color (Light)": { hex: "222222" },
    },
  })
  writeFileSync(
    input,
    [scheme("Test Night", true), scheme("Test Day", false)].map((s) => JSON.stringify(s)).join("\n")
  )
  writeFileSync(join(dir, "LICENSE"), "Test license\n")
  const run = (...args: string[]) =>
    spawnSync(
      "bun",
      [
        join(import.meta.dirname, "../../scripts/themes-iterm2.ts"),
        "--input",
        input,
        "--output",
        output,
        ...args,
      ],
      { encoding: "utf8" }
    )
  return { output, run }
}

describe("iTerm2 theme generation", () => {
  test("writes distinct, loadable palettes using generated syntax highlighting", async () => {
    const { output, run } = fixture()
    const result = run("--all")
    expect(result.status).toBe(0)
    for (const [id, name, appearance] of [
      ["test-night", "Test Night", "dark"],
      ["test-day", "Test Day", "light"],
    ] as const) {
      const theme = await loadTheme({ path: join(output, `${id}.json`) })
      expect(theme.id).toBe(id)
      expect(theme.name).toBe(name)
      expect(theme.appearance).toBe(appearance)
      expect(theme.shiki).toBe("auto")
      const highlighted = await shiki.highlight('"hello"', "typescript", shikiTheme(theme))
      expect(highlighted).toContain(openAnsi({ fg: "#80ff80" }))
    }
    expect(readFileSync(join(output, "LICENSE"), "utf8")).toBe("Test license\n")
    const first = readFileSync(join(output, "test-night.json"), "utf8")
    const credits = readFileSync(join(output, "README.md"), "utf8")
    expect(credits).toContain("Test Night — Test author")
    expect(run("--all").status).toBe(0)
    expect(readFileSync(join(output, "test-night.json"), "utf8")).toBe(first)
    expect(readFileSync(join(output, "README.md"), "utf8")).toBe(credits)
  })

  test("applies requested appearance overrides", async () => {
    const { output, run } = fixture()
    expect(run("--theme", "Test Night", "--appearance", "Light").status).toBe(0)
    const theme = await loadTheme({ path: join(output, "test-night.json") })
    expect(theme.appearance).toBe("light")
    expect(theme.bg).toBe("#ffffff")
    expect(theme.fg).toBe("#222222")
  })

  test("reports unknown source schemes", () => {
    const { run } = fixture()
    const result = run("--theme", "Missing")
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain("Scheme not found: Missing")
  })
})
