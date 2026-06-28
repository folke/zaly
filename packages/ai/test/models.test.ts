import type { AuthManager } from "../src/index.ts"
import type { ModelSpec } from "../src/types.ts"

import { describe, expect, test } from "vitest"
import { getModel } from "../src/index.ts"
import { modelCollection } from "../src/model.ts"
import { filterModel } from "../src/models/filter.ts"

const customSpec = (overrides: Partial<ModelSpec> = {}): ModelSpec => ({
  id: "mocks-x/model-x",
  modelId: "model-x",
  providerId: "mocks-x",
  contextSize: 1000,
  maxTokens: 100,
  input: ["text"],
  name: "Model X",
  api: "mock-models-test",
  reasoning: false,
  ...overrides,
})

describe("addModels / getModel", () => {
  test("custom registration is retrievable", async () => {
    const models = modelCollection()
    models.register(customSpec({ id: "mock-models-test/foo", name: "Foo" }))
    const m = await models.get("mock-models-test/foo")
    expect(m?.name).toBe("Foo")
  })

  test("custom registrations override built-ins with the same id", async () => {
    const models = modelCollection()
    models.register(customSpec({ id: "mock-models-test/override-target", name: "Custom" }))
    const m = await models.get("mock-models-test/override-target")
    expect(m?.name).toBe("Custom")
  })

  test("returns undefined for unknown ids", async () => {
    expect(await getModel("not-a-real-provider/not-a-real-model")).toBeUndefined()
  })
})

describe("filterModel", () => {
  const visionModel: ModelSpec = customSpec({
    id: "vision",
    input: ["text", "image"],
    output: ["text", "image"],
    reasoning: true,
  })
  const textModel: ModelSpec = customSpec({ id: "text" })

  test("reasoning filter narrows by capability", async () => {
    expect(await filterModel(visionModel, { reasoning: true })).toBe(true)
    expect(await filterModel(textModel, { reasoning: true })).toBe(false)
    expect(await filterModel(textModel, { reasoning: false })).toBe(true)
  })

  test("modality shorthand checks input modalities", async () => {
    expect(await filterModel(visionModel, { modality: "image" })).toBe(true)
    expect(await filterModel(textModel, { modality: "image" })).toBe(false)
  })

  test("modality object form narrows on output too", async () => {
    expect(await filterModel(visionModel, { modality: { output: ["text"] } })).toBe(true)
    expect(await filterModel(visionModel, { modality: { output: ["audio"] } })).toBe(false)
  })

  test("auth filter delegates to AuthProvider.getAuth", async () => {
    const yes = { getAuth: () => ({ apiKey: "k" }) } as unknown as AuthManager
    const no = { getAuth: () => undefined } as unknown as AuthManager
    expect(await filterModel(textModel, { auth: yes })).toBe(true)
    expect(await filterModel(textModel, { auth: no })).toBe(false)
  })

  test("no opts → always true", async () => {
    expect(await filterModel(textModel)).toBe(true)
  })
})

describe("listModels", () => {
  test("includes custom models", async () => {
    const models = modelCollection()
    models.register(customSpec({ id: "mock-models-test/listed" }))
    const all = await models.list()
    const model = all.find((m) => m.id === "mock-models-test/listed")
    expect(model).toBeDefined()
  })

  test("filters apply to built-ins", async () => {
    // Use auth filter that rejects everything: built-ins drop out,
    // custom registrations stay (they bypass the filter).
    const models = modelCollection()
    models.register(customSpec({ id: "mock-models-test/listed-filter" }))
    const out = await models.list({ auth: { getAuth: () => undefined } as unknown as AuthManager })
    const listed = out.find((m) => m.id === "mock-models-test/listed-filter")
    const missing = out.find((m) => m.id === "anthropic/claude-sonnet-4-6")
    expect(listed).toBeDefined()
    // Sanity check: a known auth-gated built-in must be absent. Avoid
    // an "every key matches my prefix" assertion — sibling test files
    // also register customs (the customModels Map is module-global) and
    // those would leak in here when the full suite runs.
    expect(missing).toBeUndefined()
  })
})
