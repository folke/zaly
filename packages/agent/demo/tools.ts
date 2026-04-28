import type { ToolContext } from "@zaly/ai"

import { runTool, stringifyToolResult } from "@zaly/ai"
import { bashTool } from "../src/index.ts"

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
    bashTool,
    {
      command: "fd -IH",
      description: "list all files",
    },
    ctx
  ),
])

const parts = ret.map((r) => stringifyToolResult(r.content)).join("\n\n")
console.log(parts)
