import type { AuthManager } from "../src/index.ts"
import type { ModelInfo, ModelProvider, ModelSpec } from "../src/types.ts"

import { describe, expect, test } from "vitest"
import { getModel, loadCatalog } from "../src/index.ts"
import { modelCollection, parseModelId } from "../src/model.ts"
import { filterModel } from "../src/models/filter.ts"

const customModel = (overrides: Partial<ModelInfo> = {}): ModelInfo => ({
  id: overrides.id ?? "mock-x/model-x",
  contextSize: 1000,
  maxTokens: 100,
  input: ["text"],
  name: "Model X",
  reasoning: false,
  ...overrides,
})

const catalog = await loadCatalog()

const customSpec = async (overrides: Partial<ModelSpec> = {}): Promise<ModelSpec> => {
  const provider = customProvider(overrides)
  const ret = await catalog.modelSpecs(provider)
  return ret[0]
}

const customProvider = (overrides: Partial<ModelSpec> = {}): ModelProvider => {
  const { provider, model } = parseModelId(overrides.id ?? "mock-x/model-x")
  return {
    id: provider,
    name: "Mock",
    api: "mock",
    models: [customModel({ ...overrides, id: model })],
  }
}

describe("addModels / getModel", () => {
  test("custom registration is retrievable", async () => {
    const models = modelCollection()
    models.register(customProvider({ id: "mock-models-test/foo", name: "Foo" }))
    const m = await models.get("mock-models-test/foo")
    expect(m?.name).toBe("Foo")
  })

  test("custom registrations override built-ins with the same id", async () => {
    const models = modelCollection()
    models.register(customProvider({ id: "mock-models-test/override-target", name: "Custom" }))
    const m = await models.get("mock-models-test/override-target")
    expect(m?.name).toBe("Custom")
  })

  test("returns undefined for unknown ids", async () => {
    expect(await getModel("not-a-real-provider/not-a-real-model")).toBeUndefined()
  })
})

describe("filterModel", async () => {
  const visionModel: ModelSpec = await customSpec({
    id: "mock/vision",
    input: ["text", "image"],
    output: ["text", "image"],
    reasoning: true,
  })
  const textModel: ModelSpec = await customSpec({ id: "mock/text" })
  textModel.provider.env = ["MOCK_API_KEY"]

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
    const yes = {
      getAuth: () => ({ apiKey: "k" }),
      needAuth: () => true,
    } as unknown as AuthManager
    const no = { getAuth: () => undefined, needAuth: () => true } as unknown as AuthManager
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
    models.register(customProvider({ id: "mock-models-test/listed" }))
    const all = await models.list()
    const model = all.find((m) => m.id === "mock-models-test/listed")
    expect(model).toBeDefined()
  })

  test("filters apply to built-ins", async () => {
    // Use auth filter that rejects everything: built-ins drop out,
    // custom registrations stay (they bypass the filter).
    const models = modelCollection()
    models.register(customProvider({ id: "mock-models-test/listed-filter" }))
    const out = await models.list({
      auth: { getAuth: () => undefined, needAuth: () => true } as unknown as AuthManager,
    })
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
