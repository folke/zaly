import { defineConfig } from "oxlint"
import baseConfig from "../../oxlint.config.ts"

export default defineConfig({
  ignorePatterns: ["src/schemas/gen/*.ts"],
  extends: [baseConfig],
})
