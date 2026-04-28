import type { ToolContext } from "@zaly/ai"

import { runTool, stringifyContent } from "@zaly/ai"
import { bashTool } from "../src/index.ts"
import { searchTool } from "../src/tools/search.ts"

const ctx: ToolContext = {}

const ret = await Promise.all([
  runTool(
    bashTool,
    {
      command: "ls -l",
      description: "Print a greeting to the console.",
    },
    ctx
  ),
  runTool(
    searchTool,
    {
      query: "folke lemaitre",
    },
    ctx
  ),
])

const parts = ret.map((r) => stringifyContent(r.content)).join("\n\n")
console.log(parts)
