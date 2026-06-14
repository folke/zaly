import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    main: "src/main.ts",
    zaly: "bin/zaly.ts",
  },
  exports: {
    bin: {
      zaly: "./bin/zaly.ts",
    },
  },
  outputOptions: {
    plugins: [
      {
        name: "fix-shebang",
        renderChunk(code, chunk) {
          if (chunk.name === "zaly") {
            return code.replace(/^#!.*\bbun\b.*/, "#!/usr/bin/env node")
          }
        },
      },
    ],
  },
})
