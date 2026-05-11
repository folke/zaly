#!/usr/bin/env bun
// oxlint-disable sort-keys

import { defineCommand, runMain } from "citty"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "pathe"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

function currentPackage(): string | undefined {
  if (process.cwd() === root) return undefined
  try {
    const json = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8"))
    return typeof json.name === "string" && json.name !== "zaly" ? json.name : undefined
  } catch {
    return undefined
  }
}

async function exec(cmd: string[], cwd: string = process.cwd()): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdio: ["inherit", "inherit", "inherit"] })
  const code = await proc.exited
  if (code !== 0) process.exit(code)
}

const main = defineCommand({
  meta: {
    name: "z",
    description: "Zaly monorepo dev dispatcher",
  },
  subCommands: {
    build: defineCommand({
      meta: { description: "Build the current package (or all when run from root)" },
      run: async () => {
        const pkg = currentPackage()
        const args = ["tsdown", "--cwd", root, ...(pkg ? ["--filter", pkg] : [])]
        await exec(args)
      },
    }),
    test: defineCommand({
      meta: { description: "Run vitest for the current package (or all from root); --bun also runs bun test" },
      args: {
        bun: { type: "boolean", description: "Also run `bun test` before vitest", default: false },
      },
      run: async ({ args }) => {
        const pkg = currentPackage()
        if (pkg) {
          if (args.bun) await exec(["bun", "test"])
          await exec(["vitest", "-r", root, "--project", pkg, "run"])
        } else {
          if (args.bun) await exec(["bun", "test", "--no-env-file"], root)
          await exec(["vitest", "run"], root)
        }
      },
    }),
    lint: defineCommand({
      meta: { description: "Lint with oxlint (stylish output)" },
      args: {
        fix: { type: "boolean", description: "Auto-fix issues", default: false },
      },
      run: async ({ args }) => {
        await exec(["oxlint", "-f", "stylish", ...(args.fix ? ["--fix"] : [])])
      },
    }),
    fmt: defineCommand({
      meta: { description: "Format with oxfmt" },
      run: async () => {
        await exec(["oxfmt"])
      },
    }),
  },
})

await runMain(main)
