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

const writeSkill = (opts: {
  scope: "project" | "user"
  dirname: string
  meta: { name: string; description: string }
  body: string
  refs?: Record<string, string>
}) => {
  const root =
    opts.scope === "project" ? join(cwd, ".agent/skills") : join(cwd, "user/.agent/skills")
  const dir = join(root, opts.dirname)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${opts.meta.name}\ndescription: ${opts.meta.description}\n---\n${opts.body}`
  )
  for (const [rel, content] of Object.entries(opts.refs ?? {})) {
    const p = join(dir, rel)
    mkdirSync(join(p, ".."), { recursive: true })
    writeFileSync(p, content)
  }
  return dir
}

/** Build a loaded Skills, optionally pointing at a fake `$HOME` so we
 *  can exercise user-scope discovery without touching the real one. */
const loadSkills = async (opts: { fakeUserHome?: string } = {}): Promise<Skills> => {
  const before = process.env.HOME
  if (opts.fakeUserHome) process.env.HOME = opts.fakeUserHome
  try {
    const skills = new Skills({ cwd })
    await skills.load()
    return skills
  } finally {
    if (opts.fakeUserHome !== undefined) {
      if (before === undefined) delete process.env.HOME
      else process.env.HOME = before
    }
  }
}

describe("Skills — discovery", () => {
  test("empty catalog and undefined tool when no skills are present", async () => {
    const skills = await loadSkills()
    expect(skills.catalog.size).toBe(0)
    expect(skills.tool).toBeUndefined()
  })

  test("discovers project-scope skills", async () => {
    writeSkill({
      body: "# PDF body",
      dirname: "pdf",
      meta: { description: "Work with PDFs", name: "pdf" },
      scope: "project",
    })
    const skills = await loadSkills()
    expect(skills.catalog.size).toBe(1)
    expect(skills.catalog.get("pdf")?.scope).toBe("project")
    expect(skills.catalog.get("pdf")?.description).toBe("Work with PDFs")
  })

  test("discovers user-scope skills via $HOME override", async () => {
    writeSkill({
      body: "# Data body",
      dirname: "data",
      meta: { description: "Crunch datasets", name: "data" },
      scope: "user",
    })
    const skills = await loadSkills({ fakeUserHome: join(cwd, "user") })
    expect(skills.catalog.get("data")?.scope).toBe("user")
  })

  test("project scope shadows user scope on name collision", async () => {
    writeSkill({
      body: "user body",
      dirname: "shared",
      meta: { description: "user version", name: "shared" },
      scope: "user",
    })
    writeSkill({
      body: "project body",
      dirname: "shared",
      meta: { description: "project version", name: "shared" },
      scope: "project",
    })
    const skills = await loadSkills({ fakeUserHome: join(cwd, "user") })
    expect(skills.catalog.get("shared")?.scope).toBe("project")
    expect(skills.catalog.get("shared")?.description).toBe("project version")
  })

  test("dirs lists the skill base directories", async () => {
    const dir = writeSkill({
      body: "body",
      dirname: "x",
      meta: { description: "x", name: "x" },
      scope: "project",
    })
    const skills = await loadSkills()
    expect(skills.dirs).toContain(dir)
  })

  test("load() is idempotent — repeat calls reset and rescan", async () => {
    writeSkill({
      body: "body",
      dirname: "first",
      meta: { description: "x", name: "first" },
      scope: "project",
    })
    const skills = await loadSkills()
    expect(skills.catalog.has("first")).toBe(true)

    // Add a new skill on disk and reload.
    writeSkill({
      body: "body",
      dirname: "second",
      meta: { description: "x", name: "second" },
      scope: "project",
    })
    await skills.load()
    expect(skills.catalog.has("first")).toBe(true)
    expect(skills.catalog.has("second")).toBe(true)
  })

  test("load() rebuilds the tool when the catalog changes", async () => {
    writeSkill({
      body: "body",
      dirname: "a",
      meta: { description: "x", name: "a" },
      scope: "project",
    })
    const skills = await loadSkills()
    const first = skills.tool
    expect(first).toBeDefined()

    // Add another skill, reload — same getter must produce a fresh tool
    // (the schema enum is now larger).
    writeSkill({
      body: "body",
      dirname: "b",
      meta: { description: "x", name: "b" },
      scope: "project",
    })
    await skills.load()
    expect(skills.tool).not.toBe(first)
  })
})

describe("Skills.tool — activation", () => {
  test("returns a <skill> MetaPart + body TextPart", async () => {
    writeSkill({
      body: "# Demo\n\nThis is the body.",
      dirname: "demo",
      meta: { description: "Demo skill", name: "demo" },
      scope: "project",
    })
    const skills = await loadSkills()
    const tool = skills.tool
    if (!tool) throw new Error("expected tool")
    const result = (await tool.call({ name: "demo" }, {})) as (MetaPart | TextPart)[]
    const meta = result.find((p) => p.type === "meta")
    if (!meta) throw new Error("expected meta")
    const data = meta.data as { name: string; scope: string; references: string[]; dir: string }
    expect(data.name).toBe("demo")
    expect(data.scope).toBe("project")
    expect(Array.isArray(data.references)).toBe(true)

    const text = result.find((p) => p.type === "text")
    if (!text) throw new Error("expected text")
    expect(text.text).toContain("# Demo")
    expect(text.text).toContain("This is the body.")
  })

  test("frontmatter is stripped from the body", async () => {
    writeSkill({
      body: "BODY-SENTINEL",
      dirname: "x",
      meta: { description: "x", name: "x" },
      scope: "project",
    })
    const skills = await loadSkills()
    const tool = skills.tool
    if (!tool) throw new Error("expected tool")
    const result = (await tool.call({ name: "x" }, {})) as (MetaPart | TextPart)[]
    const text = result.find((p) => p.type === "text")
    expect(text && "text" in text ? text.text : "").toBe("BODY-SENTINEL")
    expect(text && "text" in text ? text.text : "").not.toContain("---")
  })

  test("references are listed (not read)", async () => {
    writeSkill({
      body: "body",
      dirname: "with-refs",
      meta: { description: "x", name: "with-refs" },
      refs: {
        "references/spec.md": "spec content",
        "scripts/run.sh": "echo hi",
      },
      scope: "project",
    })
    const skills = await loadSkills()
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
    writeSkill({
      body: "body",
      dirname: "exists",
      meta: { description: "x", name: "exists" },
      scope: "project",
    })
    const skills = await loadSkills()
    const tool = skills.tool
    if (!tool) throw new Error("expected tool")
    await expect(tool.call({ name: "missing" } as never, {})).rejects.toMatchObject({
      code: "UNKNOWN_SKILL",
    })
  })
})

describe("Skills — frontmatter parsing", () => {
  test("tolerates unquoted descriptions containing colons", async () => {
    const dir = join(cwd, ".agent/skills/colons")
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, "SKILL.md"),
      "---\nname: colons\ndescription: Use this when: things have colons\n---\nbody"
    )
    const skills = await loadSkills()
    expect(skills.catalog.get("colons")?.description).toBe("Use this when: things have colons")
  })

  test("strips surrounding quotes from values", async () => {
    const dir = join(cwd, ".agent/skills/quoted")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), `---\nname: "quoted"\ndescription: 'q-desc'\n---\nbody`)
    const skills = await loadSkills()
    expect(skills.catalog.get("quoted")?.description).toBe("q-desc")
  })

  test("missing description → skill skipped", async () => {
    const dir = join(cwd, ".agent/skills/incomplete")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "SKILL.md"), "---\nname: incomplete\n---\nbody")
    const skills = await loadSkills()
    expect(skills.catalog.size).toBe(0)
  })
})

describe("Skills — Agent integration", () => {
  test("Agent.skills is undefined when constructed with `skills: false`", async () => {
    const { Agent } = await import("../src/agent.ts")
    const { mockModel } = await import("./helpers.ts")
    const agent = await Agent.load({ model: mockModel([]), skills: false })
    expect(agent.skills).toBeUndefined()
  })

  test("Agent.skills exists by default; tool is undefined until load()", async () => {
    const { Agent } = await import("../src/agent.ts")
    const { mockModel } = await import("./helpers.ts")
    const agent = await Agent.load({ model: mockModel([]), permissions: { cwd } })
    expect(agent.skills).toBeDefined()
    expect(agent.skills?.tool).toBeUndefined() // not loaded yet
  })

  test("after load() with skills present, agent.skills.tool is defined", async () => {
    writeSkill({
      body: "body",
      dirname: "x",
      meta: { description: "x", name: "x" },
      scope: "project",
    })
    const { Agent } = await import("../src/agent.ts")
    const { mockModel } = await import("./helpers.ts")
    const agent = await Agent.load({ model: mockModel([]), permissions: { cwd } })
    await agent.skills?.load()
    expect(agent.skills?.tool).toBeDefined()
    expect(agent.skills?.catalog.has("x")).toBe(true)
  })
})
