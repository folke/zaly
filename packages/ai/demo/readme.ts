import type { Message, ToolCallPart } from "@zaly/ai"

import { collect, defineTool, loadModel, runTool } from "@zaly/ai"
import { Type } from "typebox"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel(process.env.MODEL ?? "openai/gpt-4o-mini")

const messages: Message[] = [{ content: "What is 17 × 23?", role: "user" }]

for (;;) {
  const { message } = await collect(model.stream({ messages, tools: [multiply] }))
  messages.push(message)

  const calls = (Array.isArray(message.content) ? message.content : []).filter(
    (p): p is ToolCallPart => p.type === "tool-call"
  )
  if (calls.length === 0) break

  const results = await Promise.all(
    calls.map(async (c) => {
      const r = await runTool(multiply, c.params, {})
      return {
        content: r.content,
        id: c.id,
        isError: r.isError,
        name: c.name,
        type: "tool-result" as const,
      }
    })
  )
  messages.push({ content: results, role: "tool" })
}

console.log(JSON.stringify(messages.at(-1), undefined, 2))
