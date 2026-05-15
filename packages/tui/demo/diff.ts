import { box, createCtx, diff, text } from "@zaly/tui"

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

const modified = `import type { Config } from "./config.ts"

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Load the agent config. Looks for \`agent.json\` at the path given by
 * \`$ZALY_CONFIG\`, falling back to cwd.
 */
export function loadConfig(): Config {
  const envPath = process.env.ZALY_CONFIG?.trim()
  const path = envPath !== undefined && envPath !== ""
    ? resolve(envPath)
    : resolve(process.cwd(), "agent.json")
  const raw = readFileSync(path, "utf8")
  return JSON.parse(raw) as Config
}

export function greet(name: string): string {
  return \`hello \${name}\`
}
`.replace(/\n$/, "")

const ctx = await createCtx({ width: 100 })

const heading = (s: string) => text(({ style }) => style.primary(s))

const app = box(
  { flexDirection: "column", gap: 1, padding: [1, 1] },
  heading("@zaly/tui — diff() demo"),
  diff({
    context: 2,
    lang: "typescript",
    modified,
    original,
  })
)

const rendered = await app.render(ctx)
console.log(rendered.join("\n"))
