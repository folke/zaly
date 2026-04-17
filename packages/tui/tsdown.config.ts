import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    neverBundle: ["#runtime"],
  },
  entry: {
    glob: "src/glob.ts",
    index: "src/index.ts",
    "runtime.node": "src/runtime.node.ts",
  },
  exports: {
    devExports: "bun",
  },
})
