import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const packages = ["shared", "ai", "tui", "config", "plugin", "agent"]
for (const pkg of packages) await import(`@zaly/${pkg}`)

const { loadCatalog } = await import("@zaly/ai")
const catalog = await loadCatalog()
assert(Object.keys(catalog.$).length > 0, "Catalog asset is empty")

const { loadTheme, themeRegistry } = await import("@zaly/tui/themes")
for (const id of themeRegistry.keys()) {
  const theme = await loadTheme(id)
  assert.equal(theme.id, id, `Packed theme failed to load: ${id}`)
}

const profile = join(process.cwd(), "test-profile")
for (const key of ["CONFIG", "STATE", "CACHE", "DATA", "LOG", "TMP"]) {
  process.env[`ZALY_${key}`] = join(profile, key.toLowerCase())
  mkdirSync(process.env[`ZALY_${key}`], { recursive: true })
}
mkdirSync(join(process.cwd(), ".zaly"), { recursive: true })
writeFileSync(
  join(profile, "config/config.json"),
  JSON.stringify({ keymap: { test: "A" }, ui: { shiki: "auto" } })
)
writeFileSync(
  join(profile, "config/models.json"),
  JSON.stringify({ local: { models: [{ id: "test", input: ["text"] }] } })
)
writeFileSync(join(profile, "state/state.json"), JSON.stringify({ lastModel: "local/test" }))
const { loadConfig } = await import("@zaly/config")
const { Logger } = await import("@zaly/shared/logger")
const config = await loadConfig({ cwd: process.cwd(), logger: new Logger() })
assert.equal(config.$.keymap.test, "shift-a", "Packed config did not normalize keymaps")
assert.equal(config.$.ui.shiki, "auto")
assert.equal(config.models.$.local.models[0].id, "test", "Packed model validation failed")
assert.equal(config.state.$.lastModel, "local/test", "Packed state validation failed")

// An active app handle lets the intentionally unreferenced worker finish its request.
const keepAlive = setInterval(() => {}, 1000)
try {
  const { codeToAnsi, shikiTheme } = await import("@zaly/tui")
  const code = "const answer = 42"
  const highlighted = await codeToAnsi(code, "typescript")
  assert(highlighted.includes("\u001b["), "Shiki worker did not highlight the code")
  const system = await loadTheme("system")
  const generated = await codeToAnsi('"hello"', "typescript", { theme: shikiTheme(system) })
  assert(generated.includes("\u001b[32m"), "Generated theme lost its terminal ANSI colors")
  assert(!generated.includes("38;2;"), "Generated ANSI theme invented RGB colors")
} finally {
  clearInterval(keepAlive)
}

const cli = JSON.parse(readFileSync("node_modules/@zaly/cli/package.json", "utf8"))
const entry = typeof cli.bin === "string" ? cli.bin : cli.bin.zaly
const version = execFileSync(process.execPath, [`node_modules/@zaly/cli/${entry}`, "--version"], {
  encoding: "utf8",
  timeout: 15_000,
}).trim()
assert.equal(version, cli.version)
console.log(
  `${process.versions.bun ? "Bun" : "Node"}: packed exports, catalog, theme, Shiki worker, and CLI version passed`
)
