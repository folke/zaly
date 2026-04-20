#!/usr/bin/env bun

import { readFileSync } from "node:fs"

async function run(...cmd: string[]) {
  const proc = Bun.spawn(cmd, { stderr: "pipe", stdout: "pipe" })
  return new Response(proc.stdout).text()
}

// Get all valid rule names from oxlint print-config
const printConfig = JSON.parse(await run("bun", "check", "--print-config"))
const validRules = new Set<string>(Object.keys(printConfig.rules ?? {}))

// Parse .oxlintrc.json (JSONC with comments)
const configRaw = readFileSync(".oxlintrc.json", "utf8")
const config = Bun.JSONC.parse(configRaw) as { rules?: Record<string, unknown> } | undefined
const configRules = Object.keys(config?.rules ?? {})

// Validate
console.log("=== Validating existing config ===\n")
let invalid = 0
for (const rule of configRules) {
  if (!validRules.has(rule)) {
    console.log(`  ✖ Unknown rule: ${rule}`)
    invalid++
  }
}
if (invalid === 0) console.log("  ✔ All rules in .oxlintrc.json are valid")
else console.log(`\n  ✖ Found ${invalid} invalid rule(s)`)

// Run oxlint and group warnings
console.log("\n=== Triggering Rules ===\n")
const output = JSON.parse(await run("bun", "check", "--format", "json"))
const counts = new Map<string, number>()

for (const d of output.diagnostics ?? []) {
  let code: string = d.code ?? "unknown"
  // oxlint-disable-next-line prefer-const
  let [_, plugin, rule] = code.match(/^(.*)\((.*)\)$/) ?? []

  if (!plugin || !rule) {
    console.error(`Unexpected code format: ${code}`)
    continue
  }

  plugin = plugin.replace(/^eslint-plugin-/, "").replace(/-eslint$/, "")

  code = plugin === "eslint" ? rule : `${plugin}/${rule}`
  counts.set(code, (counts.get(code) ?? 0) + 1)
}

const sorted = [...counts.entries()].toSorted((a, b) => b[1] - a[1])
for (const [rule, count] of sorted) {
  console.log(`    "${rule}": "off",  // ${count}`)
}
