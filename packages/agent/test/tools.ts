import type { Model } from "@zaly/ai"

import { toolRegistry } from "../src/tools/registry.ts"

for (const name of toolRegistry.keys()) {
  console.log(name)
  const tool = await toolRegistry.load(name, {
    model: {
      canAttach: () => true,
    } as Model,
    cwd: process.cwd(),
  })
  console.log(tool.params)
  console.log("\n\n\n\n")
}
