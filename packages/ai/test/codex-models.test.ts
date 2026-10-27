import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test, vi } from "vitest"
import { codexModelArgs, codexModels, generateCodexModels } from "../scripts/codex-models.ts"

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zaly-codex-models-"))
})
afterAll(() => rmSync(dir, { force: true, recursive: true }))

test.each([
  { args: [] },
  { args: ["--source", "other"] },
  { args: ["--cache", "/tmp/cache.json"] },
  { args: ["--source", "github", "--cache", "/tmp/cache.json"] },
  { args: ["--source", "local", "--unknown"] },
])("requires an explicit valid source and rejects ambiguous options: $args", ({ args }) => {
  expect(() => codexModelArgs(args)).toThrow()
})

test("parses explicit local and GitHub sources", () => {
  expect(codexModelArgs(["--source", "local", "--cache", "/tmp/cache.json"])).toEqual({
    source: "local",
    cachePath: "/tmp/cache.json",
  })
  expect(codexModelArgs(["--source=github"])).toEqual({ source: "github", cachePath: undefined })
})

test("fetches raw GitHub model metadata only when explicitly selected", async () => {
  const target = join(dir, "github-overrides.ts")
  writeFileSync(target, "// start:codex-models\nstale\n// end:codex-models\n")
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      Response.json({ models: [{ slug: "github-model", context_window: 272_000 }] })
    )
  try {
    await generateCodexModels({ source: "github" }, target)
    expect(request).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/openai/codex/main/codex-rs/models-manager/models.json",
      { signal: expect.any(AbortSignal) }
    )
    expect(readFileSync(target, "utf8")).toContain('"github-model": 272_000')
  } finally {
    request.mockRestore()
  }
})

test.each([
  { status: 503, body: "unavailable" },
  { status: 200, body: "not JSON" },
  { status: 200, body: '{"models":[]}' },
])(
  "failed or invalid GitHub responses leave the mapping unchanged: %j",
  async ({ status, body }) => {
    const target = join(dir, "failed-github.ts")
    const original = "// start:codex-models\nkeep existing mapping\n// end:codex-models\n"
    writeFileSync(target, original)
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status }))
    try {
      await expect(generateCodexModels({ source: "github" }, target)).rejects.toThrow()
      expect(readFileSync(target, "utf8")).toBe(original)
    } finally {
      request.mockRestore()
    }
  }
)

test("local generation does not access the network", async () => {
  const cache = join(dir, "offline-cache.json")
  const target = join(dir, "offline-overrides.ts")
  writeFileSync(
    cache,
    JSON.stringify({ models: [{ slug: "local-model", context_window: 500_000 }] })
  )
  writeFileSync(target, "// start:codex-models\nstale\n// end:codex-models\n")
  const request = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected network access"))
  try {
    await generateCodexModels({ source: "local", cachePath: cache }, target)
    expect(request).not.toHaveBeenCalled()
    expect(readFileSync(target, "utf8")).toContain('"local-model": 500_000')
  } finally {
    request.mockRestore()
  }
})

test("extracts API slugs rather than display names and sorts deterministically", () => {
  const mapping = codexModels({
    models: [
      { slug: "z-model", display_name: "Pretty name", context_window: 500_000, visibility: "hide" },
      { slug: "a-model", context_window: 272_000 },
      { slug: "z-model", context_window: 500_000 },
    ],
  })
  expect(mapping).toEqual({ "a-model": 272_000, "z-model": 500_000 })
  expect(Object.keys(mapping)).toEqual(["a-model", "z-model"])
})

test.each([
  undefined,
  {},
  { models: [] },
  { models: [undefined] },
  { models: [{ slug: "", context_window: 500_000 }] },
  { models: [{ slug: "a", context_window: 0 }] },
  { models: [{ slug: "a", context_window: "500000" }] },
  { models: [{ slug: "a", context_window: 1.5 }] },
  {
    models: [
      { slug: "a", context_window: 1 },
      { slug: "a", context_window: 2 },
    ],
  },
])("rejects invalid or conflicting cache data: %j", (cache) => {
  expect(() => codexModels(cache)).toThrow()
})

test("updates only the marked region and produces formatter-stable output", async () => {
  const cache = join(dir, "cache.json")
  const target = join(dir, "overrides.ts")
  writeFileSync(
    cache,
    JSON.stringify({ models: [{ slug: "test-model", context_window: 500_000 }] })
  )
  writeFileSync(target, "before\n// start:codex-models\nstale\n// end:codex-models\nafter\n")
  await generateCodexModels({ source: "local", cachePath: cache }, target)
  const generated = readFileSync(target, "utf8")
  expect(generated).toBe(
    'before\n// start:codex-models\nconst codexModels: Record<string, number> = {\n  "test-model": 500_000,\n}\n// end:codex-models\nafter\n'
  )
  await generateCodexModels({ source: "local", cachePath: cache }, target)
  expect(readFileSync(target, "utf8")).toBe(generated)
})

test.each([
  "no markers",
  "// end:codex-models\n// start:codex-models",
  "// start:codex-models\n// start:codex-models\n// end:codex-models",
  "// start:codex-models\n// end:codex-models\n// end:codex-models",
])("refuses to write ambiguous or missing marker regions: %s", async (source) => {
  const cache = join(dir, "valid-cache.json")
  const target = join(dir, "bad-region.ts")
  writeFileSync(cache, JSON.stringify({ models: [{ slug: "a", context_window: 272_000 }] }))
  writeFileSync(target, source)
  await expect(generateCodexModels({ source: "local", cachePath: cache }, target)).rejects.toThrow(
    /exactly one/
  )
  expect(readFileSync(target, "utf8")).toBe(source)
})
