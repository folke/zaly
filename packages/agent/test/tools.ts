import { toolRegistry } from "../src/tools/registry.ts"

for (const name of toolRegistry.keys()) {
  console.log(name)
  const tool = await toolRegistry.load(name)
  console.log(tool.params)
  console.log("\n\n\n\n")
}
