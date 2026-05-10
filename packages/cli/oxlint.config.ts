import { defineConfig } from "oxlint"
const baseConfig = await import("../../oxlint.config.ts" as string)

export default defineConfig({
  extends: [baseConfig.default],
  rules: {
    "eslint/no-console": "off",
  },
})
