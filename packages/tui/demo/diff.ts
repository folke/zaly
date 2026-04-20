import type { DiffEdit } from "../src/widgets/diff.ts"

import { box, createCtx, diff, text } from "../src/index.ts"

// Original file — a small module with three call sites we'll edit in
// different ways to exercise add / remove / replace plus multiple hunks.
const original = `import type { Config } from "./config.ts"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Load the agent config. Looks for \`agent.json\` relative to cwd.
 */
export function loadConfig(): Config {
  const path = resolve(process.cwd(), "agent.json")
  const raw = readFileSync(path, "utf8")
  return JSON.parse(raw) as Config
}

export function greet(name: string): string {
  return "hello " + name
}

export function farewell(name: string): string {
  return "bye " + name
}
`.replace(/\n$/, "")

const edits: DiffEdit[] = [
  // Replace the JSDoc block to mention the env var fallback.
  {
    from: 5,
    replacement: [
      "/**",
      " * Load the agent config. Looks for `agent.json` at the path given by",
      " * `$ZALY_CONFIG`, falling back to cwd.",
      " */",
    ],
    to: 7,
  },
  // Rewrite `loadConfig` to honour the env var.
  {
    from: 9,
    replacement: [
      "  const envPath = process.env.ZALY_CONFIG?.trim()",
      '  const path = envPath !== undefined && envPath !== ""',
      "    ? resolve(envPath)",
      '    : resolve(process.cwd(), "agent.json")',
    ],
    to: 10,
  },
  // Template-literal rewrite for greet.
  {
    from: 15,
    // oxlint-disable-next-line no-template-curly-in-string
    replacement: ["  return `hello ${name}`"],
    to: 16,
  },
  // Delete the farewell export entirely.
  {
    from: 18,
    replacement: [],
    to: 22,
  },
]

const ctx = createCtx({ width: 100 })

const heading = (s: string) => text(({ style }) => style.primary(s))

const app = box(
  { flexDirection: "column", gap: 1, padding: [1, 1] },
  heading("@zaly/tui — diff() demo"),
  diff({
    context: 2,
    edits,
    lang: "typescript",
    original,
    title: "src/config.ts",
  })
)

const rendered = await app.render(ctx)
console.log(rendered.join("\n"))
