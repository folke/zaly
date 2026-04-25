import { defineConfig } from "tsdown"

export default defineConfig({
  attw: { profile: "esm-only" },
  clean: true,
  deps: {
    alwaysBundle: ["slice-ansi", "string-width", "wrap-ansi"],
  },
  dts: {
    sourcemap: true,
  },
  exports: {
    devExports: "bun",
  },
  format: ["esm"],
  publint: true,
  workspace: "packages/*",
})
