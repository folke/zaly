import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const packages = ["shared", "ai", "tui", "config", "plugin", "agent"]
for (const pkg of packages) await import(`@zaly/${pkg}`)

const { loadCatalog, reasoningLevels, resolveReasoning } = await import("@zaly/ai")
const catalog = await loadCatalog()
assert(Object.keys(catalog.$).length > 0, "Catalog asset is empty")
assert(
  catalog.provider("anthropic")?.models?.some((model) => model.reasoning_options?.length),
  "Reasoning metadata is missing from the packed catalog"
)
const reasoningModel = {
  id: "packed-test",
  reasoning: true,
  reasoning_options: [{ type: "effort", values: ["low", "medium", "high"] }],
}
assert.deepEqual(reasoningLevels(reasoningModel), ["low", "medium", "high"])
assert.equal(resolveReasoning(reasoningModel, "off"), "low")

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

const { toolRegistry } = await import("@zaly/agent")
const fetchTool = await toolRegistry.load("fetch")
const webpage = `<html><head><title>Packed fetch</title></head><body><main><h1>Documentation</h1><a href="https://example.com/guide">Guide</a><table><tr><th>A</th></tr><tr><td>B</td></tr></table></main></body></html>`
const fetchArgs = await fetchTool.validator.validateParams({
  url: `data:text/html,${encodeURIComponent(webpage)}`,
})
const { runTool } = await import("@zaly/ai")
const fetched = await runTool(fetchTool, fetchArgs, {})
assert.equal(fetched.meta.kind, "fetch", "Packed fetch lost sidecar metadata")
assert.equal(fetched.meta.format, "markdown")
const markdown = fetched.content.find((part) => part.type === "text")
assert.equal(markdown.format, "markdown")
assert(markdown.text.includes("# Documentation"), "Packed fetch lost Markdown headings")
assert(markdown.text.includes("[Guide](https://example.com/guide)"), "Packed fetch lost hyperlinks")
assert(/\| A\s*\|/.test(markdown.text), "Packed fetch lost table conversion")

const { createCtx } = await import("@zaly/tui")
const { markdown: mathMarkdown } = await import("@zaly/tui/widgets/markdown")
let mathBytes = ""
const mathNode = mathMarkdown(
  String.raw`$$\frac{1}{${process.pid}} + \mathbb{R} + \begin{cases}0 & x < 0 \\ 1 & x \ge 0\end{cases}$$`
)
mathNode.mount({
  input: {
    blur() {},
    queries: { xtVersion: async () => ({ name: "kitty", version: "0" }) },
  },
  surface: "history",
})
try {
  const rows = await mathNode.render(
    await createCtx({
      transmit: (seq) => {
        mathBytes += seq
      },
      width: 40,
    })
  )
  assert(mathBytes.includes("\x1b_Ga=t,"), "Packed math did not transmit a generated image")
  assert(rows.join("\n").includes("\u{10eeee}"), "Packed math lost image placement")
} finally {
  mathNode.unmount()
}

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
