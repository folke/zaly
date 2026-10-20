import { toolRegistry } from "@zaly/agent"
import { runTool, stringifyContent } from "@zaly/ai"

const grepTool = await toolRegistry.load("grep")
const findTool = await toolRegistry.load("find")
const fetchTool = await toolRegistry.load("fetch")

const ret = await runTool(
  grepTool,
  { context: 1, cwd: ".", file_type: ["md", "ts"], pattern: "Optional" },
  {}
)
const text = stringifyContent(ret.content)

console.log(ret.meta)
console.log(text)

const findRet = await runTool(findTool, { cwd: ".", glob: "package.json", max_depth: 3 }, {})
console.log(findRet.meta)
console.log(stringifyContent(findRet.content))

const fetchRet = await runTool(fetchTool, { url: "https://bun.com/docs/runtime/markdown" }, {})
console.log(fetchRet.meta)
console.log(stringifyContent(fetchRet.content))
