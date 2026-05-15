import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    // `#ansi` (string-width / slice-ansi / wrap-ansi) is pervasive; `#md`
    // (marked, ~100ms cold) is only pulled by the markdown widget. Keeping
    // both external lets the main bundle stay lean and defers marked until
    // `await import("#md")` actually runs.
    neverBundle: ["#ansi", "#md"],
    onlyBundle: [
      "slice-ansi",
      "string-width",
      "wrap-ansi",
      "ansi-styles",
      "get-east-asian-width",
      "is-fullwidth-code-point",
      "ansi-regex",
      "strip-ansi",
      "typia",
    ],
  },
  entry: {
    index: "src/index.ts",
    "ansi.node": "src/runtime/ansi.node.ts",
    "md.node": "src/runtime/md.node.ts",
    "ansi.bun": "src/runtime/ansi.bun.ts",
    "md.bun": "src/runtime/md.bun.ts",
    themes: "src/themes/registry.ts",
    logger: "src/logger/index.ts",
    markdown: "src/markdown/index.ts",
  },
  exports: {
    // `ansi`/`md` are entries only so tsdown emits them as separate
    // chunks (for `publishConfig.imports` to point at). They're not
    // part of the public surface.
    exclude: ["ansi.*", "md.*"],
  },
})
