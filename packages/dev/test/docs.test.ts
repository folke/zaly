import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { expect, test } from "vitest"
import {
  generateDocs,
  referencePages,
  referenceRegions,
  schemaType,
  settingsReference,
  updateRegion,
} from "../src/docs.ts"

test("schema types describe enums, arrays, alternatives, and references", () => {
  expect(schemaType({ enum: ["a", "b"] })).toBe('"a" | "b"')
  expect(schemaType({ type: "array", items: { type: "string" } })).toBe("Array<string>")
  expect(schemaType({ anyOf: [{ type: "string" }, { type: "boolean" }] })).toBe("string | boolean")
  expect(schemaType({ $ref: "#/components/schemas/ResourceFilter" })).toBe("ResourceFilter")
  expect(schemaType({})).toBe("unknown")
  expect(
    schemaType(
      { anyOf: [{ const: "auto" }, { $ref: "#/definitions/Theme" }] },
      {
        Theme: { enum: ["dark", "light"] },
      }
    )
  ).toBe('"auto" | "dark" | "light"')
})

test("settings include nested defaults, resolved resource filters, and permission rules", () => {
  const page = settingsReference()
  expect(page).toContain("## `compaction.threshold`")
  expect(page).toContain("**Default:** `0.95`")
  expect(page).toContain('"enabled"')
  expect(page).toContain("### readonly")
  expect(page).toContain("bash(sudo:*)")
  expect(page).toContain("runtime-dependent")
  expect(page).toContain('"catppuccin-mocha"')
  expect(page).not.toContain("structure-")
})

test("reference generation reads live CLI, action, keybinding, and tool definitions deterministically", async () => {
  const pages = await referencePages()
  expect(Object.keys(pages).toSorted()).toEqual([
    "cli.md",
    "commands.md",
    "keybindings.md",
    "settings.md",
    "tools.md",
  ])
  expect(pages["cli.md"]).toContain("`--permission`")
  expect(pages["cli.md"]).toContain("## zaly models")
  expect(pages["commands.md"]).toContain("## /login")
  expect(pages["commands.md"]).toContain("`--project`")
  expect(pages["keybindings.md"]).toContain("`input.submit`")
  expect(pages["keybindings.md"]).toContain("`enter`")
  expect(pages["tools.md"]).toContain("## read")
  expect(pages["tools.md"]).toContain('"offset"')
  expect(pages["tools.md"]).toContain('"maximum"')
  expect(await referencePages()).toEqual(pages)
})

test.each(["\n", "\r\n"])(
  "region replacement preserves all surrounding text and line endings (%j)",
  (newline) => {
    const before = `---${newline}title: Handwritten${newline}---${newline}  Intro  ${newline}<!-- keys:start -->${newline}old${newline}<!-- keys:end -->${newline}  More examples  `
    const expected = before.replace(
      `${newline}old${newline}`,
      `${newline}new${newline}table${newline}`
    )
    const updated = updateRegion(before, "keys", "new\ntable\n")
    expect(updated).toBe(expected)
    expect(updateRegion(updated, "keys", "new\ntable\n")).toBe(updated)
  }
)

test.each([
  "no markers",
  "<!-- keys:start -->",
  "<!-- keys:end -->\n<!-- keys:start -->",
  "<!-- keys:start -->\n<!-- other:end -->",
  "<!-- keys:start -->\n<!-- keys:start -->\n<!-- keys:end -->",
  "<!-- keys:start -->\n<!-- keys:end -->\n<!-- keys:end -->",
  "<!-- keys:start -->\n<!-- other:start -->\n<!-- other:end -->\n<!-- keys:end -->",
])("invalid or ambiguous markers fail without producing replacement content (%j)", (source) => {
  expect(() => updateRegion(source, "keys", "new")).toThrow()
})

async function fixtures(dir: string) {
  const pages = await referencePages()
  const originals = Object.fromEntries(
    Object.entries(referenceRegions).map(([name, region]) => [
      name,
      `# ${name}\n\nHandwritten introduction.\n\n<!-- ${region}:start -->\nold\n<!-- ${region}:end -->\n\nHandwritten examples.\n`,
    ])
  )
  await Promise.all(
    Object.entries(originals).map(([name, content]) => writeFile(join(dir, name), content))
  )
  return { pages, originals }
}

test("generation updates only marked regions and leaves unchanged files untouched", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zaly-docs-"))
  try {
    const { pages, originals } = await fixtures(dir)
    await writeFile(join(dir, "paths.md"), "Handwritten paths reference.\n")
    await generateDocs(dir)
    for (const [name, original] of Object.entries(originals)) {
      const path = join(dir, name)
      expect(await readFile(path, "utf8")).toBe(
        updateRegion(original, referenceRegions[name], pages[name])
      )
    }
    await Promise.all(Object.keys(originals).map((name) => utimes(join(dir, name), 1, 1)))
    const before = await Promise.all(Object.keys(originals).map((name) => stat(join(dir, name))))
    await generateDocs(dir)
    const after = await Promise.all(Object.keys(originals).map((name) => stat(join(dir, name))))
    expect(after.map((entry) => entry.mtimeMs)).toEqual(before.map((entry) => entry.mtimeMs))
    expect(await readFile(join(dir, "paths.md"), "utf8")).toBe("Handwritten paths reference.\n")
    expect(await readdir(dir)).toHaveLength(6)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("one malformed page prevents writes to every reference page", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zaly-docs-"))
  try {
    const { originals } = await fixtures(dir)
    originals["tools.md"] = "Handwritten content with no markers.\n"
    await writeFile(join(dir, "tools.md"), originals["tools.md"])
    await expect(generateDocs(dir)).rejects.toThrow("tools:start")
    for (const [name, original] of Object.entries(originals)) {
      expect(await readFile(join(dir, name), "utf8")).toBe(original)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("missing pages are not silently scaffolded or overwritten", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zaly-docs-"))
  try {
    await expect(generateDocs(dir)).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
