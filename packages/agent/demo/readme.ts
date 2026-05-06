import { Agent } from "@zaly/agent"
import { defineTool, loadModel } from "@zaly/ai"
import { Type } from "typebox"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel("openai/gpt-4o-mini")

const agent = await Agent.load({
  model,
  tools: [multiply],
})

agent.send({ content: "What is 17 × 23?", role: "user" })
const stopReason = await agent.run()

console.log("stopReason:", stopReason)
console.log("last message:", JSON.stringify(agent.messages.at(-1), undefined, 2))
console.log("usage:", agent.usage)
