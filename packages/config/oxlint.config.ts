import { defineConfig } from "oxlint"

const baseConfig = await import("../../oxlint.config.ts" as string)

export default defineConfig({
  ignorePatterns: ["src/schemas/gen/*.ts"],
  extends: [baseConfig.default],
})
