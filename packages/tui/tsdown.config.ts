import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    // `#ansi` (string-width / slice-ansi / wrap-ansi) is pervasive; `#md`
    // (marked, ~100ms cold) is only pulled by the markdown widget. Keeping
    // both external lets the main bundle stay lean and defers marked until
    // `await import("#md")` actually runs.
    neverBundle: ["#md"],
    onlyBundle: ["typia"],
  },
  entry: {
    "md.bun": "src/runtime/md.bun.ts",
    "md.node": "src/runtime/md.node.ts",
    "services/*": "src/services/*.ts",
    "widgets/*": "src/widgets/*.ts",
    "widgets/completions/*": "src/widgets/completions/*.ts",
    ansi: "src/style/ansi.ts",
    clipboard: "src/input/clipboard.ts",
    index: "src/index.ts",
    markdown: "src/markdown/index.ts",
    style: "src/style/index.ts",
    text: "src/layout/text.ts",
    themes: "src/themes/registry.ts",
  },
  exports: {
    // `ansi`/`md` are entries only so tsdown emits them as separate
    // chunks (for `publishConfig.imports` to point at). They're not
    // part of the public surface.
    exclude: ["md.*"],
  },
})
