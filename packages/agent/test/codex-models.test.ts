import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, expect, test } from "vitest"
import { codexModels, generateCodexModels } from "../scripts/codex-models.ts"

let dir: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "zaly-codex-models-"))
})
afterAll(() => rmSync(dir, { force: true, recursive: true }))

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
  await generateCodexModels(cache, target)
  const generated = readFileSync(target, "utf8")
  expect(generated).toBe(
    'before\n// start:codex-models\nconst codexModels: Record<string, number> = {\n  "test-model": 500_000,\n}\n// end:codex-models\nafter\n'
  )
  await generateCodexModels(cache, target)
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
  await expect(generateCodexModels(cache, target)).rejects.toThrow(/exactly one/)
  expect(readFileSync(target, "utf8")).toBe(source)
})
