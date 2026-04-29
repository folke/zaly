import type { Provider, StreamEvent } from "../src/provider.ts"

import { describe, expect, test } from "vitest"
import { loadModel } from "../src/model.ts"
import { addModels } from "../src/models.ts"
import { collect } from "../src/provider.ts"
import { providerRegistry } from "../src/providers/index.ts"

// ── Local mock provider (registered once for the whole file) ───────────

let scriptedEvents: StreamEvent[] = []

providerRegistry.register(
  "mock-cost-test",
  (): Promise<Provider<"mock-cost-test">> =>
    Promise.resolve({
      id: "mock-cost-test",
      async *stream() {
        for (const ev of scriptedEvents) yield ev
      },
    })
)

addModels({
  "mock-cost-test/cheap": {
    cost: { cache_read: 0.5, cache_write: 5, input: 1, output: 4, reasoning: 8 },
    id: "cheap",
    limit: { context: 100_000, output: 4096 },
    modalities: { input: ["text"], output: ["text"] },
    name: "Cheap",
    provider: "mock-cost-test" as never,
    reasoning: false,
    attachment: false,
  },
  "mock-cost-test/freebie": {
    // No cost field — augmentation should be a no-op.
    id: "freebie",
    limit: { context: 100_000, output: 4096 },
    modalities: { input: ["text"], output: ["text"] },
    name: "Freebie",
    provider: "mock-cost-test" as never,
    reasoning: false,
    attachment: false,
  },
})

describe("loadModel — error paths", () => {
  test("throws a helpful error for unknown ids", async () => {
    await expect(loadModel("not-a-real-provider/not-a-real-model")).rejects.toThrow(
      /Unknown model.*addModels/s
    )
  })

  test("accepts an inline ModelSpec without a catalog lookup", async () => {
    const m = await loadModel({
      attachment: false,
      id: "inline",
      limit: { context: 1000, output: 100 },
      modalities: { input: ["text"], output: ["text"] },
      name: "Inline",
      provider: "mock-cost-test" as never,
      reasoning: false,
    })
    expect(m.id).toBe("mock-cost-test/inline")
  })
})

describe("Model.stream — cost augmentation", () => {
  test("populates usage.cost from the catalog price table", async () => {
    scriptedEvents = [
      {
        finishReason: "stop",
        type: "finish",
        usage: { cacheRead: 200, cacheWrite: 100, input: 1000, output: 50, reasoning: 20 },
      },
    ]
    const model = await loadModel("mock-cost-test/cheap")
    const { usage } = await collect(model.stream({ messages: [{ content: "hi", role: "user" }] }))
    const cost = usage.cost!
    // Uncached input = 1000 - 200 - 100 = 700
    // Prices per million: input=1, output=4, cache_read=0.5, cache_write=5, reasoning=8
    expect(cost.input).toBeCloseTo((700 * 1) / 1_000_000)
    expect(cost.output).toBeCloseTo((50 * 4) / 1_000_000)
    expect(cost.cacheRead).toBeCloseTo((200 * 0.5) / 1_000_000)
    expect(cost.cacheWrite).toBeCloseTo((100 * 5) / 1_000_000)
    expect(cost.reasoning).toBeCloseTo((20 * 8) / 1_000_000)
  })

  test("models without a price table get usage but no cost", async () => {
    scriptedEvents = [{ finishReason: "stop", type: "finish", usage: { input: 100, output: 10 } }]
    const model = await loadModel("mock-cost-test/freebie")
    const { usage } = await collect(model.stream({ messages: [{ content: "hi", role: "user" }] }))
    expect(usage.input).toBe(100)
    expect(usage.output).toBe(10)
    expect(usage.cost).toBeUndefined()
  })
})
