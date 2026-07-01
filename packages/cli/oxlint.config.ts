import { defineConfig } from "oxlint"

const baseConfig = await import("../../oxlint.config.ts")

export default defineConfig({
  extends: [baseConfig.default],
  rules: {
    "eslint/no-console": "off",
  },
})
