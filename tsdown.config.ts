import { defineConfig } from "tsdown"

// ─── Condition strategy ────────────────────────────────────────────────────
//
// `bun` is used in exports (devExports: "bun") and points to source files;
// `default` points to dist. Bun auto-adds `bun` so it resolves to src; Node
// has no `bun` and falls through to dist. `publishConfig.exports` overrides
// on publish so consumers never see the conditional shape.
//
// tsconfig.json sets `customConditions: ["bun"]` so the TS resolver (tsc,
// oxlint, editor LSP, tsgo) reads the `bun` branch of exports → src.
//
// Per-package `imports` (tui's `#ansi`, `#md`) split runtime impls:
//   dev imports:
//     "#ansi": {
//       "bun":     "./src/runtime/ansi.bun.ts",   // Bun runtime → bun impl
//       "default": "./src/runtime/ansi.node.ts"   // everything else → node impl
//     }
//   publishConfig.imports (consumer-facing, bundled):
//     "#ansi": {
//       "bun":     "./dist/ansi.bun.mjs",
//       "default": "./dist/ansi.node.mjs"
//     }
// Bun-auto matches `bun` → bun impl. tsgo/oxlint also match `bun` (via
// customConditions), seeing the bun impl's types — fine because both impls
// share an API. Published Bun consumers automatically get the bun bundle;
// published Node consumers get the node bundle.
//
// Vitest runs under Node but needs the node impl regardless of which
// condition wins. Handled via `test.alias` in vitest.config.ts pointing
// `#ansi` / `#md` directly at the node-impl source files — bypasses the
// imports map entirely for vitest, so we don't need a third condition.
//
// ─── Why not...
//
//   `devExports: true`  — exports replace publishConfig directly; attw
//                         doesn't resolve publishConfig, sees src, errors.
//   collapse imports to one condition — published Bun consumers wouldn't
//                                       get the bun-specific bundle without
//                                       an opt-in flag on their side.

export default defineConfig({
  attw: { profile: "esm-only" }, // doesn't resolve publishConfig, so disable
  clean: true,
  deps: {
    //alwaysBundle: ["slice-ansi", "string-width", "wrap-ansi", "pathe"],
    neverBundle: ["bun"],
  },
  entry: {},
  dts: {
    sourcemap: true,
    tsgo: true,
  },
  exports: {
    devExports: "bun",
  },
  format: ["esm"],
  publint: true,
  workspace: {
    include: "packages/*",
    exclude: ["packages/dev"],
  },
})
