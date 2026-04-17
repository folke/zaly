import { defineConfig } from "tsdown"

export default defineConfig({
  attw: { profile: "esm-only" },
  clean: true,
  dts: {
    sourcemap: true,
  },
  exports: { devExports: "bun" },
  format: ["esm"],
  publint: true,
  workspace: true,
})
