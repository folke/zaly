import type { Message } from "@zaly/ai"
import { defineTool } from "@zaly/ai"
import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { mockModel, runAgent, throwingModel } from "./helpers.ts"

const Add = defineTool({
  call: ({ a, b }) => a + b,
  name: "add",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
})

describe("Agent — no tool calls", () => {
  test("completes in one step when the model stops", async () => {
    const model = mockModel([
      [
        { delta: "Hello!", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 10, output: 2 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "hi", role: "user" }],
      model,
    })
    expect(result.steps).toBe(1)
    expect(result.stopReason).toBe("natural")
    expect(result.messages.at(-1)?.role).toBe("assistant")
  })
})

describe("Agent — tool-calls loop", () => {
  test("executes a tool call and continues until natural stop", async () => {
    const model = mockModel([
      [
        { params: { a: 2, b: 3 }, id: "call_1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 10, output: 5 } },
      ],
      [
        { delta: "The answer is 5.", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 15, output: 8 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "what is 2+3?", role: "user" }],
      model,
      tools: [Add],
    })
    expect(result.steps).toBe(2)
    expect(result.stopReason).toBe("natural")
    const roles = result.messages.map((m) => m.role)
    expect(roles).toEqual(["user", "assistant", "tool", "assistant"])
    const toolMsg = result.messages[2] as Message<"tool">
    expect(toolMsg.content[0].result).toBe(5)
    expect(toolMsg.content[0].isError).toBe(false)
  })

  test("surfaces an unknown-tool error to the model and keeps going", async () => {
    const model = mockModel([
      [
        { params: {}, id: "c1", name: "mystery", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 5, output: 3 } },
      ],
      [
        { delta: "sorry", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 8, output: 1 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model,
      tools: [Add],
    })
    const toolMsg = result.messages[2] as Message<"tool">
    expect(toolMsg.content[0].isError).toBe(true)
    expect(String(toolMsg.content[0].result)).toMatch(/UNKNOWN_TOOL|mystery/)
  })

  test("stops after maxSteps even if the model keeps calling tools", async () => {
    const model = mockModel([
      [
        { params: { a: 1, b: 1 }, id: "c1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
      [
        { params: { a: 1, b: 1 }, id: "c2", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "loop", role: "user" }],
      model,
      policy: { maxSteps: 2 },
      tools: [Add],
    })
    expect(result.steps).toBe(2)
    expect(result.stopReason).toBe("max-steps")
  })
})

describe("Agent — usage accumulation", () => {
  test("totalUsage sums across all streams; usage is the last step's", async () => {
    const model = mockModel([
      [
        { params: { a: 1, b: 1 }, id: "c1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 10, output: 5 } },
      ],
      [
        { delta: "ok", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 20, output: 3 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model,
      tools: [Add],
    })
    expect(result.totalUsage).toEqual({ input: 30, output: 8 })
    expect(result.usage).toEqual({ input: 20, output: 3 })
  })
})

describe("Agent — token budget", () => {
  test("stops with token-budget when summed usage exceeds the cap", async () => {
    const model = mockModel([
      [
        { params: { a: 1, b: 1 }, id: "c1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 60, output: 30 } },
      ],
      [
        { params: { a: 1, b: 1 }, id: "c2", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 80, output: 40 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model,
      policy: { tokenBudget: 80 },
      tools: [Add],
    })
    expect(result.stopReason).toBe("token-budget")
    expect(result.steps).toBe(1)
  })
})

describe("Agent — max tool errors", () => {
  test("stops after N consecutive failing tool calls", async () => {
    const model = mockModel([
      [
        { params: {}, id: "c1", name: "missing", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
      [
        { params: {}, id: "c2", name: "missing", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
      [
        { params: {}, id: "c3", name: "missing", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model,
      policy: {
        // Disable loop detection so repeated identical failing calls
        // don't trip "loop-detected" before the error cap fires.
        loopConsecutive: Infinity,
        loopWindowRepeats: Infinity,
        maxToolErrors: 3,
      },
      tools: [Add],
    })
    expect(result.stopReason).toBe("max-tool-errors")
    expect(result.steps).toBe(3)
  })

  test("a successful tool call resets the consecutive counter", async () => {
    const model = mockModel([
      [
        { params: {}, id: "c1", name: "missing", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
      [
        { params: { a: 1, b: 2 }, id: "c2", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
      [
        { params: {}, id: "c3", name: "missing", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
      [
        { delta: "ok", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 1, output: 1 } },
      ],
    ])
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model,
      policy: { maxToolErrors: 2 },
      tools: [Add],
    })
    expect(result.stopReason).toBe("natural")
  })
})

describe("Agent — context overflow", () => {
  test("detects overflow from a thrown stream error", async () => {
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model: throwingModel("This model's maximum context length is 8192 tokens."),
    })
    expect(result.stopReason).toBe("context-overflow")
  })

  test("detects silent overflow against contextLimit", async () => {
    const model = mockModel([
      [{ finishReason: "stop", type: "finish", usage: { input: 9000, output: 5 } }],
    ])
    const result = await runAgent({
      contextLimit: 8000,
      messages: [{ content: "go", role: "user" }],
      model,
    })
    expect(result.stopReason).toBe("context-overflow")
  })

  test("genuine errors surface as stopReason: error", async () => {
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model: throwingModel("network down"),
    })
    expect(result.stopReason).toBe("error")
  })
})

function sameAddCall(id: string): {
  id: string
  name: "add"
  params: { a: number; b: number }
  type: "tool-call"
} {
  return { id, name: "add", params: { a: 1, b: 1 }, type: "tool-call" }
}

describe("Agent — loop detection", () => {
  test("stops with loop-detected after N identical consecutive calls", async () => {
    // Three iterations, each calling add(1,1) — trips loopConsecutive=3.
    const sameCall = sameAddCall
    const model = mockModel([
      [sameCall("c1"), { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } }],
      [sameCall("c2"), { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } }],
      [sameCall("c3"), { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } }],
    ])
    const result = await runAgent({
      messages: [{ content: "go", role: "user" }],
      model,
      policy: { loopConsecutive: 3 },
      tools: [Add],
    })
    expect(result.stopReason).toBe("loop-detected")
  })
})
