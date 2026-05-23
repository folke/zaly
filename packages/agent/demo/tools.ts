import type { Model } from "@zaly/ai"

import { toolRegistry } from "@zaly/agent"
import { runTool, stringifyContent } from "@zaly/ai"

const grepTool = await toolRegistry.load("grep", {
  cwd: process.cwd(),
  model: undefined as unknown as Model,
})
const findTool = await toolRegistry.load("find", {
  cwd: process.cwd(),
  model: undefined as unknown as Model,
})

const ret = await runTool(
  grepTool,
  { context: 1, cwd: ".", file_type: ["md", "ts"], pattern: "Optional" },
  {}
)
const text = stringifyContent(ret.content)

console.log(ret.meta)
console.log(text)

const findRet = await runTool(findTool, { cwd: ".", max_depth: 3, name: "package.json" }, {})
console.log(findRet.meta)
console.log(stringifyContent(findRet.content))
