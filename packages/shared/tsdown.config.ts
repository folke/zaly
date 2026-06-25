import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    // `#ansi` (string-width / slice-ansi / wrap-ansi) is pervasive; `#md`
    // (marked, ~100ms cold) is only pulled by the markdown widget. Keeping
    // both external lets the main bundle stay lean and defers marked until
    // `await import("#md")` actually runs.
    neverBundle: ["#ansi", "#glob"],
    onlyBundle: [
      "ansi-regex",
      "ansi-styles",
      "get-east-asian-width",
      "ignore",
      "image-meta",
      "is-fullwidth-code-point",
      "picomatch",
      "slice-ansi",
      "string-width",
      "strip-ansi",
      "wrap-ansi",
      "js-yaml",
      "shell-quote",
      "picomatch",
    ],
  },
  entry: {
    "ansi.bun": "src/runtime/ansi.bun.ts",
    "ansi.node": "src/runtime/ansi.node.ts",
    "glob.bun": "src/runtime/glob.bun.ts",
    "glob.node": "src/runtime/glob.node.ts",
    ansi: "src/ansi.ts",
    args: "src/args.ts",
    cache: "src/cache.ts",
    collection: "src/collection.ts",
    detect: "src/detect/index.ts",
    prop: "src/prop.ts",
    env: "src/env.ts",
    find: "src/find.ts",
    glob: "src/glob.ts",
    image: "src/image/index.ts",
    index: "src/index.ts",
    logger: "src/logger.ts",
    minheap: "src/minheap.ts",
    paths: "src/paths/index.ts",
    process: "src/process/index.ts",
    registry: "src/registry.ts",
    shell: "src/shell.ts",
    template: "src/template.ts",
    text: "src/text.ts",
    throttle: "src/throttle.ts",
    yaml: "src/yaml.ts",
  },
  exports: {
    // `ansi`/`glob` are entries only so tsdown emits them as separate
    // chunks (for `publishConfig.imports` to point at). They're not
    // part of the public surface.
    exclude: ["ansi.*", "glob.*"],
  },
})
