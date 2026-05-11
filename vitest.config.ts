import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const pkgDir = fileURLToPath(import.meta.resolve("./packages"))
const packages = readdirSync(pkgDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ["bun", "import", "module", "default"],
    },
  },

  test: {
    alias: {
      "#md": "./src/runtime/md.node.ts",
      "#ansi": "./src/runtime/ansi.node.ts",
    },
    environment: "node",
    update: "new",
    projects: packages.map((name) => ({
      extends: true,
      test: { name: `@zaly/${name}`, root: `${pkgDir}/${name}` },
    })),
  },
})
