import { replacePlugin } from "rolldown/plugins"
import { defineConfig } from "tsdown"
import pkg from "./package.json" with { type: "json" }

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
      replacePlugin({ __VERSION__: JSON.stringify(pkg.version) }),
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
