import type { Model } from "@zaly/ai"

import { toolRegistry } from "@zaly/agent"
import { justText, runTool } from "@zaly/ai"

const grepTool = await toolRegistry.load("grep", {
  cwd: process.cwd(),
  model: undefined as unknown as Model,
})

const ret = await runTool(
  grepTool,
  { context: 1, cwd: ".", file_type: ["md", "ts"], pattern: "Optional" },
  {}
)
const text = justText(ret.content)

console.log(ret.meta)
console.log(text)
