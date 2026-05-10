import { defineConfig } from "tsdown"

// - devExports:bun -> vitest uses dist/
// - devExports:true -> attw complains since it doesnt resolve publishConfig
// - devExports:source -> vitest only allows one devExport condition, so this would break bun
// - exports.customExports -> works, but leaks sources in publishConfig and would also break bun
// - devExports:true is the proper way to make it work. attw can be run on the CI using build artifacts

export default defineConfig({
  // attw: { profile: "esm-only" }, // doesn't resolve publishConfig, so disable
  clean: true,
  deps: {
    alwaysBundle: ["slice-ansi", "string-width", "wrap-ansi", "pathe"],
  },
  entry: {},
  dts: {
    sourcemap: true,
    tsgo: true,
  },
  exports: {
    devExports: true,
  },
  format: ["esm"],
  publint: true,
  workspace: "packages/*",
})
