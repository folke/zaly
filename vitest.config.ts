import { readdirSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const pkgDir = join(fileURLToPath(import.meta.url), "../packages")
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
      "#md": join(pkgDir, "tui/src/runtime/md.node.ts"),
      "#ansi": join(pkgDir, "shared/src/runtime/ansi.node.ts"),
      "#glob": join(pkgDir, "shared/src/runtime/glob.node.ts"),
    },
    environment: "node",
    update: "new",
    projects: packages.map((name) => ({
      extends: true,
      test: { name: `@zaly/${name}`, root: `${pkgDir}/${name}` },
    })),
  },
})
