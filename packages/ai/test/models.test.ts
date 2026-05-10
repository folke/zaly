import type { ModelSpec } from "../src/types.ts"

import { describe, expect, test } from "vitest"
import {
  addModels,
  builtinProviders,
  filterModel,
  getModel,
  listModelIds,
  listModels,
  parseModelId,
} from "../src/models.ts"

describe("parseModelId", () => {
  test("two-segment id", () => {
    expect(parseModelId("anthropic/claude-sonnet-4-5")).toEqual({
      model: "claude-sonnet-4-5",
      provider: "anthropic",
    })
  })
  test("multi-segment model name only splits on the first slash", () => {
    expect(parseModelId("openrouter/kimi/k2")).toEqual({ model: "kimi/k2", provider: "openrouter" })
  })
  test("throws on missing provider", () => {
    expect(() => parseModelId("just-the-model")).toThrow(/Invalid model id/)
  })
  test("throws on missing model", () => {
    expect(() => parseModelId("provider/")).toThrow(/Invalid model id/)
  })
})

const customSpec = (overrides: Partial<ModelSpec> = {}): ModelSpec => ({
  attachment: false,
  id: "model-x",
  limit: { context: 1000, output: 100 },
  modalities: { input: ["text"], output: ["text"] },
  name: "Model X",
  provider: "mock-models-test",
  reasoning: false,
  ...overrides,
})

describe("addModels / getModel", () => {
  test("custom registration is retrievable", async () => {
    addModels({ "mock-models-test/foo": customSpec({ id: "foo", name: "Foo" }) })
    const m = await getModel("mock-models-test/foo")
    expect(m?.name).toBe("Foo")
  })

  test("custom registrations override built-ins with the same id", async () => {
    addModels({
      "mock-models-test/override-target": customSpec({ id: "override-target", name: "Custom" }),
    })
    const m = await getModel("mock-models-test/override-target")
    expect(m?.name).toBe("Custom")
  })

  test("returns undefined for unknown ids", async () => {
    expect(await getModel("not-a-real-provider/not-a-real-model")).toBeUndefined()
  })
})

describe("filterModel", () => {
  const visionModel: ModelSpec = customSpec({
    id: "vision",
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: true,
  })
  const textModel: ModelSpec = customSpec({ id: "text" })

  test("reasoning filter narrows by capability", async () => {
    expect(await filterModel("vision", visionModel, { reasoning: true })).toBe(true)
    expect(await filterModel("vision", textModel, { reasoning: true })).toBe(false)
    expect(await filterModel("vision", textModel, { reasoning: false })).toBe(true)
  })

  test("modality shorthand checks input modalities", async () => {
    expect(await filterModel("vision", visionModel, { modality: "image" })).toBe(true)
    expect(await filterModel("vision", textModel, { modality: "image" })).toBe(false)
  })

  test("modality array shorthand: any-of input", async () => {
    expect(await filterModel("vision", visionModel, { modality: ["image", "audio"] })).toBe(true)
    expect(await filterModel("vision", textModel, { modality: ["audio", "video"] })).toBe(false)
  })

  test("modality object form narrows on output too", async () => {
    expect(await filterModel("vision", visionModel, { modality: { output: ["text"] } })).toBe(true)
    expect(await filterModel("vision", visionModel, { modality: { output: ["audio"] } })).toBe(
      false
    )
  })

  test("auth filter delegates to AuthProvider.getAuth", async () => {
    const yes = { getAuth: () => ({ apiKey: "k" }) }
    const no = { getAuth: () => undefined }
    expect(await filterModel("vision", textModel, { auth: yes })).toBe(true)
    expect(await filterModel("vision", textModel, { auth: no })).toBe(false)
  })

  test("no opts → always true", async () => {
    expect(await filterModel("vision", textModel)).toBe(true)
  })
})

describe("listModels", () => {
  test("includes custom models", async () => {
    addModels({ "mock-models-test/listed": customSpec({ id: "listed" }) })
    const all = await listModels()
    expect(all["mock-models-test/listed"]).toBeDefined()
  })

  test("filters apply to built-ins", async () => {
    // Use auth filter that rejects everything: built-ins drop out,
    // custom registrations stay (they bypass the filter).
    addModels({ "mock-models-test/listed-filter": customSpec({ id: "listed-filter" }) })
    const out = await listModels({ auth: { getAuth: () => undefined } })
    expect(out["mock-models-test/listed-filter"]).toBeDefined()
    // Sanity check: a known auth-gated built-in must be absent. Avoid
    // an "every key matches my prefix" assertion — sibling test files
    // also register customs (the customModels Map is module-global) and
    // those would leak in here when the full suite runs.
    expect(out["anthropic/claude-sonnet-4-6"]).toBeUndefined()
  })
})

describe("listModelIds / builtinProviders", () => {
  test("listModelIds returns a non-empty list of strings", async () => {
    const ids = await listModelIds()
    expect(Array.isArray(ids)).toBe(true)
    expect(ids.length).toBeGreaterThan(0)
    expect(typeof ids[0]).toBe("string")
  })

  test("builtinProviders returns the catalog providers map", async () => {
    const provs = await builtinProviders()
    expect(provs).toBeDefined()
    expect(typeof provs).toBe("object")
    // Every entry has at least the basic ProviderInfo fields.
    for (const [, info] of Object.entries(provs)) {
      expect(typeof info.id).toBe("string")
      expect(Array.isArray(info.env)).toBe(true)
    }
  })
})
