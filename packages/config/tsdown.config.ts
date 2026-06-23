import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    plugin: "src/plugin/index.ts",
  },
})
