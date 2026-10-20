import { defineConfig } from "oxlint"

const baseConfig = await import("../../oxlint.config.ts")

export default defineConfig({
  ignorePatterns: ["src/schemas/gen/**"],
  extends: [baseConfig.default],
})
