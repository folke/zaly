import type { AuthManager } from "../src/index.ts"
import type { ModelCatalog } from "../src/models/catalog.ts"
import type { ModelInfo, ModelProvider, ModelSpec } from "../src/types.ts"

import { describe, expect, test } from "vitest"
import { getModel, loadCatalog, parseModelId, resolveModels, toModelSpec } from "../src/index.ts"
import { modelCollection } from "../src/model.ts"
import { filterModel } from "../src/models/filter.ts"
import { builtinOverrides } from "../src/models/overrides.ts"

const customModel = (overrides: Partial<ModelInfo> = {}): ModelInfo => ({
  id: overrides.id ?? "mock-x/model-x",
  contextSize: 1000,
  maxTokens: 100,
  input: ["text"],
  name: "Model X",
  reasoning: false,
  ...overrides,
})

const customSpec = async (overrides: Partial<ModelSpec> = {}): Promise<ModelSpec> => {
  const provider = customProvider(overrides)
  const models = await resolveModels(provider, await loadCatalog())
  return toModelSpec(models[0], provider)
}

const customProvider = (overrides: Partial<ModelSpec> = {}): ModelProvider => {
  const [provider, model] = parseModelId(overrides.id ?? "mock-x/model-x")
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

describe("builtinOverrides", () => {
  test("openai-codex returns no cloned models without an openai provider", async () => {
    const models = builtinOverrides["openai-codex"]?.models as (
      catalog: ModelCatalog
    ) => Promise<ModelInfo[]>
    const catalog = { provider: () => undefined } as unknown as ModelCatalog
    await expect(models(catalog)).resolves.toEqual([])
  })

  test("openai-codex clones codex and selected GPT models with capped context", async () => {
    const models = builtinOverrides["openai-codex"]?.models as (
      catalog: ModelCatalog
    ) => Promise<ModelInfo[]>
    const openai = customProvider({ id: "openai/gpt-5.5", contextSize: 500_000 })
    const openaiModels = openai.models as ModelInfo[]
    openaiModels.push(customModel({ id: "gpt-4", contextSize: 128_000 }))
    openaiModels.push(customModel({ id: "gpt-5.4-mini", contextSize: 300_000 }))
    const catalog = {
      provider: (id: string) => (id === "openai" ? openai : undefined),
    } as unknown as ModelCatalog

    const cloned = await models(catalog)
    expect(cloned.map((m) => m.id)).toEqual(["gpt-5.5", "gpt-5.4-mini"])
    expect(cloned.map((m) => m.contextSize)).toEqual([270_000, 270_000])
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
})
