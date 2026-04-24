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
