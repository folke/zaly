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
    neverBundle: ["#runtime"],
  },
  entry: {
    index: "src/index.ts",
    "runtime.node": "src/runtime/node.ts",
    themes: "src/themes/index.ts",
    ...themeEntries,
  },
  // oxlint-disable-next-line sort-keys
  exports: {
    devExports: "bun",
    // Keep tsdown from emitting 13 sibling entries under `./themes/*`
    // — a single subpath pattern below covers them all.
    exclude: ["themes/*"],
    customExports(exports) {
      exports["./themes/*"] = {
        bun: "./src/themes/*.ts",
        default: "./dist/themes/*.mjs",
      }
      return exports
    },
  },
})
