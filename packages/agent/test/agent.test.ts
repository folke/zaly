import type { Provider, StreamEvent } from "../src/provider.ts"
import type { Message } from "../src/types.ts"

import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { runAgentTurn } from "../src/agent.ts"
import { defineTool } from "../src/tools.ts"

/** Scripts an array of stream event arrays; one stream per turn. */
function mockProvider(scripts: StreamEvent[][]): Provider {
  // oxlint-disable-next-line no-unused-vars
  let turn = 0
  return {
    id: "mock",
    async *stream() {
      for (const ev of scripts[turn++]) yield ev
    },
  }
}

const Add = defineTool({
  call: ({ a, b }) => a + b,
  name: "add",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
})

describe("runAgentTurn — no tool calls", () => {
  test("completes in one iteration when the model stops", async () => {
    const provider = mockProvider([
      [
        { delta: "Hello!", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 10, output: 2 } },
      ],
    ])
    const result = await runAgentTurn({
      provider,
      request: {
        messages: [{ content: "hi", role: "user" }],
        model: "mock/x",
      },
    })
    expect(result.iterations).toBe(1)
    expect(result.stopReason).toBe("natural")
    expect(result.messages.at(-1)?.role).toBe("assistant")
  })
})

describe("runAgentTurn — tool-calls loop", () => {
  test("executes a tool call and continues until natural stop", async () => {
    const provider = mockProvider([
      [
        { params: { a: 2, b: 3 }, id: "call_1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 10, output: 5 } },
      ],
      [
        { delta: "The answer is 5.", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 15, output: 8 } },
      ],
    ])

    const result = await runAgentTurn({
      provider,
      request: {
        messages: [{ content: "what is 2+3?", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
    })

    expect(result.iterations).toBe(2)
    expect(result.stopReason).toBe("natural")
    const roles = result.messages.map((m) => m.role)
    expect(roles).toEqual(["assistant", "tool", "assistant"])
    const toolMsg = result.messages[1] as Extract<Message, { role: "tool" }>
    expect(toolMsg.content[0].result).toBe(5)
    expect(toolMsg.content[0].isError).toBe(false)
  })

  test("surfaces an unknown-tool error to the model and keeps going", async () => {
    const provider = mockProvider([
      [
        { params: {}, id: "c1", name: "mystery", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 5, output: 3 } },
      ],
      [
        { delta: "sorry", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 8, output: 1 } },
      ],
    ])
    const result = await runAgentTurn({
      provider,
      request: {
        messages: [{ content: "go", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
    })
    const toolMsg = result.messages[1] as Extract<Message, { role: "tool" }>
    expect(toolMsg.content[0].isError).toBe(true)
    expect(String(toolMsg.content[0].result)).toMatch(/UNKNOWN_TOOL|mystery/)
  })

  test("stops after maxIterations even if the model keeps calling tools", async () => {
    const provider = mockProvider([
      [
        { params: { a: 1, b: 1 }, id: "c1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
      [
        { params: { a: 1, b: 1 }, id: "c2", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
    ])
    const result = await runAgentTurn({
      maxIterations: 2,
      provider,
      request: {
        messages: [{ content: "loop", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
    })
    expect(result.iterations).toBe(2)
    expect(result.stopReason).toBe("max-iterations")
  })
})

describe("runAgentTurn — usage accumulation", () => {
  test("sums usage across all streams", async () => {
    const provider = mockProvider([
      [
        { params: { a: 1, b: 1 }, id: "c1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 10, output: 5 } },
      ],
      [
        { delta: "ok", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 20, output: 3 } },
      ],
    ])
    const result = await runAgentTurn({
      provider,
      request: {
        messages: [{ content: "go", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
    })
    expect(result.usage).toEqual({ input: 30, output: 8 })
  })
})

describe("runAgentTurn — token budget", () => {
  test("stops with token-budget when summed usage exceeds the cap", async () => {
    const provider = mockProvider([
      [
        { params: { a: 1, b: 1 }, id: "c1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 60, output: 30 } },
      ],
      [
        { params: { a: 1, b: 1 }, id: "c2", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 80, output: 40 } },
      ],
    ])
    const result = await runAgentTurn({
      provider,
      request: {
        messages: [{ content: "go", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
      tokenBudget: 80,
    })
    expect(result.stopReason).toBe("token-budget")
    expect(result.iterations).toBe(1)
  })
})

describe("runAgentTurn — max tool errors", () => {
  test("stops with max-tool-errors after N consecutive failing tool calls", async () => {
    // Each iteration emits one tool call to a missing tool → isError=true.
    const provider = mockProvider([
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
    const result = await runAgentTurn({
      maxToolErrors: 3,
      provider,
      request: {
        messages: [{ content: "go", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
    })
    expect(result.stopReason).toBe("max-tool-errors")
    expect(result.iterations).toBe(3)
  })

  test("a successful tool call resets the consecutive counter", async () => {
    const provider = mockProvider([
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
    const result = await runAgentTurn({
      maxToolErrors: 2,
      provider,
      request: {
        messages: [{ content: "go", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
    })
    expect(result.stopReason).toBe("natural")
  })
})

describe("runAgentTurn — context overflow", () => {
  test("detects overflow from a thrown stream error", async () => {
    const provider: Provider = {
      id: "mock",
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new Error("This model's maximum context length is 8192 tokens.")
      },
    }
    const result = await runAgentTurn({
      provider,
      request: { messages: [{ content: "go", role: "user" }], model: "mock/x" },
    })
    expect(result.stopReason).toBe("context-overflow")
  })

  test("detects silent overflow against contextLimit", async () => {
    const provider = mockProvider([
      [{ finishReason: "stop", type: "finish", usage: { input: 9000, output: 5 } }],
    ])
    const result = await runAgentTurn({
      contextLimit: 8000,
      provider,
      request: { messages: [{ content: "go", role: "user" }], model: "mock/x" },
    })
    expect(result.stopReason).toBe("context-overflow")
  })

  test("genuine errors still surface as stopReason: error", async () => {
    const provider: Provider = {
      id: "mock",
      // eslint-disable-next-line require-yield
      async *stream() {
        throw new Error("network down")
      },
    }
    const result = await runAgentTurn({
      provider,
      request: { messages: [{ content: "go", role: "user" }], model: "mock/x" },
    })
    expect(result.stopReason).toBe("error")
  })
})

describe("runAgentTurn — loop detector", () => {
  test("stops with loop-detected when the detector returns true", async () => {
    let calledWith: unknown
    const provider = mockProvider([
      [
        { params: { a: 1, b: 1 }, id: "c1", name: "add", type: "tool-call" },
        { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
      ],
    ])
    const result = await runAgentTurn({
      loopDetector: (calls) => {
        calledWith = calls
        return true
      },
      provider,
      request: {
        messages: [{ content: "go", role: "user" }],
        model: "mock/x",
        tools: [Add],
      },
    })
    expect(result.stopReason).toBe("loop-detected")
    expect(Array.isArray(calledWith)).toBe(true)
  })
})
