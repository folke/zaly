import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    zaly: "bin/zaly.ts",
  },
  exports: {
    bin: {
      zaly: "./bin/zaly.ts",
    },
  },
})
