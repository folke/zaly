import type { MetaPart, TextPart } from "@zaly/ai"

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { Skills } from "../src/skills.ts"

let cwd: string
beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "zaly-skills-"))
})
afterEach(() => {
  rmSync(cwd, { force: true, recursive: true })
})

/** Write a SKILL.md under `cwd/<dirname>/SKILL.md` and return its absolute path. */
const writeSkill = (opts: {
  dirname: string
  meta: { name: string; description: string }
  body: string
  refs?: Record<string, string>
}): string => {
  const dir = join(cwd, opts.dirname)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, "SKILL.md")
  writeFileSync(
    path,
    `---\nname: ${opts.meta.name}\ndescription: ${opts.meta.description}\n---\n${opts.body}`
  )
  for (const [rel, content] of Object.entries(opts.refs ?? {})) {
    const p = join(dir, rel)
    mkdirSync(join(p, ".."), { recursive: true })
    writeFileSync(p, content)
  }
  return path
}

describe("Skills — catalog", () => {
  test("empty catalog and undefined tool when no paths are provided", async () => {
    const skills = await Skills.load()
    expect(skills.catalog.size).toBe(0)
    expect(skills.tool).toBeUndefined()
  })

  test("populates catalog from the provided SKILL.md paths", async () => {
    const path = writeSkill({
      body: "# PDF body",
      dirname: "pdf",
      meta: { description: "Work with PDFs", name: "pdf" },
    })
    const skills = await Skills.load({ paths: [path] })
    expect(skills.catalog.size).toBe(1)
    expect(skills.catalog.get("pdf")?.desc).toBe("Work with PDFs")
  })

  test("first occurrence wins on name collision", async () => {
    const a = writeSkill({
      body: "a",
      dirname: "a",
      meta: { description: "first", name: "shared" },
    })
    const b = writeSkill({
      body: "b",
      dirname: "b",
      meta: { description: "second", name: "shared" },
    })
    const skills = await Skills.load({ paths: [a, b] })
    expect(skills.catalog.get("shared")?.desc).toBe("first")
  })

  test("dirs lists the skill base directories", async () => {
    const path = writeSkill({
      body: "body",
      dirname: "x",
      meta: { description: "x", name: "x" },
    })
    const skills = await Skills.load({ paths: [path] })
    expect(skills.dirs).toContain(join(cwd, "x"))
  })
})

describe("Skills.tool — activation", () => {
  test("returns a <skill> MetaPart + body TextPart", async () => {
    const path = writeSkill({
      body: "# Demo\n\nThis is the body.",
      dirname: "demo",
      meta: { description: "Demo skill", name: "demo" },
    })
    const skills = await Skills.load({ paths: [path] })
    const tool = skills.tool
    if (!tool) throw new Error("expected tool")
    const result = (await tool.call({ name: "demo" }, {})) as (MetaPart | TextPart)[]
    const meta = result.find((p) => p.type === "meta")
    if (!meta) throw new Error("expected meta")
    const data = meta.data as { name: string; references: string[]; dir: string }
    expect(data.name).toBe("demo")
    expect(Array.isArray(data.references)).toBe(true)

    const text = result.find((p) => p.type === "text")
    if (!text) throw new Error("expected text")
    expect(text.text).toContain("# Demo")
    expect(text.text).toContain("This is the body.")
  })

  test("frontmatter is stripped from the body", async () => {
    const path = writeSkill({
      body: "BODY-SENTINEL",
      dirname: "x",
      meta: { description: "x", name: "x" },
    })
    const skills = await Skills.load({ paths: [path] })
    const tool = skills.tool
    if (!tool) throw new Error("expected tool")
    const result = (await tool.call({ name: "x" }, {})) as (MetaPart | TextPart)[]
    const text = result.find((p) => p.type === "text")
    expect(text && "text" in text ? text.text : "").toBe("BODY-SENTINEL")
    expect(text && "text" in text ? text.text : "").not.toContain("---")
  })

  test("references are listed (not read)", async () => {
    const path = writeSkill({
      body: "body",
      dirname: "with-refs",
      meta: { description: "x", name: "with-refs" },
      refs: {
        "references/spec.md": "spec content",
        "scripts/run.sh": "echo hi",
      },
    })
    const skills = await Skills.load({ paths: [path] })
    const tool = skills.tool
    if (!tool) throw new Error("expected tool")
    const result = (await tool.call({ name: "with-refs" }, {})) as (MetaPart | TextPart)[]
    const meta = result.find((p) => p.type === "meta")
    if (!meta) throw new Error("expected meta")
    const refs = (meta.data as { references: string[] }).references
    expect(refs).toContain("references/spec.md")
    expect(refs).toContain("scripts/run.sh")
  })

  test("UNKNOWN_SKILL when name doesn't match", async () => {
    const path = writeSkill({
      body: "body",
      dirname: "exists",
      meta: { description: "x", name: "exists" },
    })
    const skills = await Skills.load({ paths: [path] })
    const tool = skills.tool
    if (!tool) throw new Error("expected tool")
    await expect(tool.call({ name: "missing" } as never, {})).rejects.toMatchObject({
      code: "UNKNOWN_SKILL",
    })
  })
})

describe("Skills — frontmatter parsing", () => {
  test("tolerates unquoted descriptions containing colons", async () => {
    const dir = join(cwd, "colons")
    mkdirSync(dir, { recursive: true })
    const path = join(dir, "SKILL.md")
    writeFileSync(
      path,
      "---\nname: colons\ndescription: Use this when: things have colons\n---\nbody"
    )
    const skills = await Skills.load({ paths: [path] })
    expect(skills.catalog.get("colons")?.desc).toBe("Use this when: things have colons")
  })

  test("strips surrounding quotes from values", async () => {
    const dir = join(cwd, "quoted")
    mkdirSync(dir, { recursive: true })
    const path = join(dir, "SKILL.md")
    writeFileSync(path, `---\nname: "quoted"\ndescription: 'q-desc'\n---\nbody`)
    const skills = await Skills.load({ paths: [path] })
    expect(skills.catalog.get("quoted")?.desc).toBe("q-desc")
  })

  test("missing description → skill skipped", async () => {
    const dir = join(cwd, "incomplete")
    mkdirSync(dir, { recursive: true })
    const path = join(dir, "SKILL.md")
    writeFileSync(path, "---\nname: incomplete\n---\nbody")
    const skills = await Skills.load({ paths: [path] })
    expect(skills.catalog.size).toBe(0)
  })
})
