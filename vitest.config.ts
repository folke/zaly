import { readdirSync } from "node:fs"
import { defineConfig } from "vitest/config"

const packages = readdirSync("packages", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ["source", "bun", "import", "module", "default"],
    },
  },
  test: {
    environment: "node",
    update: "new",
    projects: packages.map((name) => ({
      extends: true,
      test: { name: `@zaly/${name}`, root: `packages/${name}` },
    })),
  },
})
