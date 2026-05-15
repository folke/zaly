import { createAgent } from "@zaly/agent"
import { defineTool, loadModel } from "@zaly/ai"
import { Type } from "typebox"

const multiply = defineTool({
  call: ({ a, b }) => a * b,
  desc: "multiply two numbers",
  name: "multiply",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
})

const model = await loadModel("openai/gpt-4o-mini")

const agent = await createAgent({
  model,
  tools: [multiply],
})

agent.send({ content: "What is 17 × 23?", role: "user" })
const stopReason = await agent.run()

console.log("stopReason:", stopReason)
console.log("last message:", JSON.stringify(agent.messages.at(-1), undefined, 2))
console.log("usage:", agent.usage)
