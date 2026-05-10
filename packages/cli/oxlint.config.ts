import { defineConfig } from "oxlint"
import baseConfig from "../../oxlint.config.ts"

export default defineConfig({
  extends: [baseConfig],
  rules: {
    "eslint/no-console": "off",
  },
})
