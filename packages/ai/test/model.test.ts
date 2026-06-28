import type { Provider, StreamEvent } from "../src/provider.ts"

import { describe, expect, test } from "vitest"
import { modelCollection } from "../src/model.ts"
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

const models = modelCollection()

models.register([
  {
    cost: { cache_read: 0.5, cache_write: 5, input: 1, output: 4, reasoning: 8 },
    id: "mock-cost-test/cheap",
    contextSize: 100_000,
    maxTokens: 4096,
    input: ["text"],
    name: "Cheap",
    api: "mock-cost-test" as never,
    reasoning: false,
  },
  {
    // No cost field — augmentation should be a no-op.
    id: "mock-cost-test/freebie",
    contextSize: 100_000,
    maxTokens: 4096,
    input: ["text"],
    name: "Freebie",
    api: "mock-cost-test" as never,
    reasoning: false,
  },
])

describe("loadModel — error paths", () => {
  test("throws a helpful error for unknown ids", async () => {
    await expect(models.load("not-a-real-provider/not-a-real-model")).rejects.toThrow(
      /Model.*not found/s
    )
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
    const model = await models.load("mock-cost-test/cheap")
    const message = await model.stream({ messages: [{ content: "hi", role: "user" }] })
    const cost = message.meta.usage.cost!
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
    const model = await models.load("mock-cost-test/freebie")
    const message = await model.stream({ messages: [{ content: "hi", role: "user" }] })
    expect(message.meta.usage.input).toBe(100)
    expect(message.meta.usage.output).toBe(10)
    expect(message.meta.usage.cost).toBeUndefined()
  })
})
