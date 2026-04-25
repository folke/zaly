import { Type } from "typebox"
import { defineTool, loadModel } from "@zaly/ai"
import { AgentSession } from "@zaly/agent"

const multiply = defineTool({
  name: "multiply",
  desc: "multiply two numbers",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
  call: ({ a, b }) => a * b,
})

const model = await loadModel("openai/gpt-4o-mini")

const session = new AgentSession({
  model,
  request: { tools: [multiply] },
})

session.send({ content: "What is 17 × 23?", role: "user" })
const stopReason = await session.run()

console.log("stopReason:", stopReason)
console.log("last message:", JSON.stringify(session.messages.at(-1), undefined, 2))
console.log("usage:", session.usage)
