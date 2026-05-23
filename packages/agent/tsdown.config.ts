import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    session: "src/session/index.ts",
    debug: "src/debug/index.ts",
    "session/claude": "src/session/claude.ts",
  },
})
