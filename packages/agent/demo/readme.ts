import { Type } from "typebox"
import { defineTool, loadModel } from "@zaly/ai"
import { runAgentTurn } from "@zaly/agent"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel("openai/gpt-4o-mini")

const result = await runAgentTurn({
  model,
  request: {
    messages: [{ content: "What is 17 × 23?", role: "user" }],
    tools: [multiply],
  },
})

console.log("stopReason:", result.stopReason)
console.log("last message:", JSON.stringify(result.messages.at(-1), undefined, 2))
console.log("usage:", result.usage)
