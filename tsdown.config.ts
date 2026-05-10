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
//   "#ansi": {
//     "bun":     "./src/runtime/ansi.bun.ts",     // Bun-specific impl
//     "source":  "./src/runtime/ansi.node.ts",    // vitest opts in here
//     "default": "./src/runtime/ansi.node.ts"     // everyone else
//   }
// Vitest is the only tool that adds `source` to its conditions; without it,
// vitest would resolve to the `bun` branch (since `customConditions: ["bun"]`
// flows through) and try to execute Bun-only code under Node. The `source`
// condition steers vitest to the node impl while leaving Bun's auto-resolved
// `bun` path untouched.
//
// tsgo / oxlint also read the `bun` branch here. That's fine — they only
// need declarations, not runtime behaviour, and both impls share an API.
//
// ─── Why not...
//
//   `devExports: true`     — exports replace publishConfig directly; attw
//                            doesn't resolve publishConfig, sees src, errors.
//   `devExports: "source"` — Bun would need `--conditions=source` on every
//                            invocation; `bun` is auto-added, `source` is not.
//   one condition for both axes — vitest can't separately opt into
//                                 source-from-exports and node-impl-from-imports.

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
    devExports: "bun",
  },
  format: ["esm"],
  publint: true,
  workspace: "packages/*",
})
