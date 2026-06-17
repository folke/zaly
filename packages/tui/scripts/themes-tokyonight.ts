import { isCI } from "@zaly/shared/env"
import { spawnSync } from "node:child_process"
import { cpSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

if (isCI) {
  console.log("Skipping tokyonight build on CI …")
  process.exit(0)
}

// Path to the tokyonight.nvim checkout that hosts the zaly extra template.
// Override with $TOKYONIGHT_DIR to point elsewhere (CI, a sibling checkout, …).
const tokyonightDir = process.env.TOKYONIGHT_DIR ?? join(homedir(), "projects/tokyonight.nvim")

console.log(`Building tokyonight extras in ${tokyonightDir} …`)
const build = spawnSync("./scripts/build", ["zaly"], {
  cwd: tokyonightDir,
  stdio: "inherit",
})
if (build.status !== 0) {
  console.error(`tokyonight build failed (exit ${build.status ?? "?"})`)
  process.exit(build.status ?? 1)
}

const src = join(tokyonightDir, "extras/zaly")
const dst = "assets/themes"
let copied = 0
for (const f of readdirSync(src)) {
  if (f.startsWith("tokyonight-") && f.endsWith(".json")) {
    cpSync(join(src, f), join(dst, f))
    console.log(`✔  ${f}`)
    copied++
  }
}
if (copied === 0) {
  console.error(`No tokyonight-*.json files found in ${src}`)
  process.exit(1)
}
