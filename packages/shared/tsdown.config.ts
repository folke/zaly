import { defineConfig } from "tsdown"

export default defineConfig({
  deps: {
    // `#ansi` (string-width / slice-ansi / wrap-ansi) is pervasive; `#md`
    // (marked, ~100ms cold) is only pulled by the markdown widget. Keeping
    // both external lets the main bundle stay lean and defers marked until
    // `await import("#md")` actually runs.
    neverBundle: ["#ansi"],
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
    ],
  },
  entry: {
    "ansi.node": "src/runtime/ansi.node.ts",
    "ansi.bun": "src/runtime/ansi.bun.ts",
    ansi: "src/ansi.ts",
    cache: "src/cache.ts",
    detect: "src/detect/index.ts",
    env: "src/env.ts",
    find: "src/find.ts",
    glob: "src/glob.ts",
    image: "src/image/index.ts",
    index: "src/index.ts",
    logger: "src/logger.ts",
    paths: "src/paths/index.ts",
    process: "src/process/index.ts",
    registry: "src/registry.ts",
    text: "src/text.ts",
    yaml: "src/yaml.ts",
    shell: "src/shell.ts",
    args: "src/args.ts",
    collection: "src/collection.ts",
    throttle: "src/throttle.ts",
    minheap: "src/minheap.ts",
    template: "src/template.ts",
  },
  exports: {
    // `ansi`/`md` are entries only so tsdown emits them as separate
    // chunks (for `publishConfig.imports` to point at). They're not
    // part of the public surface.
    exclude: ["ansi.*"],
  },
})
