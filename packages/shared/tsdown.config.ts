import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    env: "src/env.ts",
    registry: "src/registry.ts",
    process: "src/process/index.ts",
    detect: "src/detect/index.ts",
    image: "src/image/index.ts",
    glob: "src/glob.ts",
    paths: "src/paths/index.ts",
    cache: "src/cache.ts",
  },
})
