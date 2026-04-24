import { readdirSync } from "node:fs"
import { basename, join } from "node:path"
import { defineConfig } from "tsdown"

// Individual theme files become standalone chunks so apps importing a
// single theme don't pull every bundled palette into their bundle.
// `src/themes/*.ts` is generated from `assets/themes/*.json` by
// `scripts/gen-themes.ts`.
//
// `readdirSync` is resolved against this config file's own directory
// (via `import.meta.dirname`) rather than `process.cwd()` — tsdown in a
// monorepo runs from the repo root with `--cwd ../../ --filter ...`, so
// a cwd-relative read would miss the package's own `src/themes/`.
const themeEntries = Object.fromEntries(
  readdirSync(join(import.meta.dirname, "src/themes"))
    .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    .map((f) => {
      const name = basename(f, ".ts")
      return [`themes/${name}`, `src/themes/${f}`]
    })
)

export default defineConfig({
  deps: {
    // `#ansi` (string-width / slice-ansi / wrap-ansi) is pervasive; `#md`
    // (marked, ~100ms cold) is only pulled by the markdown widget. Keeping
    // both external lets the main bundle stay lean and defers marked until
    // `await import("#md")` actually runs.
    neverBundle: ["#ansi", "#md"],
  },
  entry: {
    index: "src/index.ts",
    ansi: "src/runtime/ansi.node.ts",
    md: "src/runtime/md.node.ts",
    themes: "src/themes/index.ts",
    ...themeEntries,
  },
  exports: {
    devExports: "bun",
    // `ansi`/`md` are entries only so tsdown emits them as separate
    // chunks (for `publishConfig.imports` to point at). They're not
    // part of the public surface — drop the auto-generated subpaths.
    // Ditto `themes/*`: a single subpath pattern below covers the 13
    // sibling entries.
    exclude: ["ansi", "md", "themes/*"],
    customExports(exports) {
      exports["./themes/*"] = {
        bun: "./src/themes/*.ts",
        default: "./dist/themes/*.mjs",
      }
      return exports
    },
  },
})
