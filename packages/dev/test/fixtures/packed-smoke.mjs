import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const packages = ["shared", "ai", "tui", "config", "plugin", "agent"]
for (const pkg of packages) await import(`@zaly/${pkg}`)

const { loadCatalog } = await import("@zaly/ai")
const catalog = await loadCatalog()
assert(Object.keys(catalog.$).length > 0, "Catalog asset is empty")

const { loadTheme } = await import("@zaly/tui/themes")
const theme = await loadTheme("dracula")
assert.equal(theme.id, "dracula")

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
