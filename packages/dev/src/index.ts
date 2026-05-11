#!/usr/bin/env bun
// oxlint-disable sort-keys

import { defineCommand, runCommand, runMain, showUsage } from "citty"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "pathe"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const passthrough = new Set(["test", "lint", "fmt"])

function currentPackage(): string | undefined {
  if (process.cwd() === root) return undefined
  try {
    const json = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8"))
    return typeof json.name === "string" && json.name !== "zaly" ? json.name : undefined
  } catch {
    return undefined
  }
}

function currentSlug(): string | undefined {
  const name = currentPackage()
  return name?.startsWith("@zaly/") ? name.slice("@zaly/".length) : undefined
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
      meta: {
        name: "build",
        description: "Build the current package (or all when run from root)",
      },
      run: async () => {
        const pkg = currentPackage()
        const args = ["tsdown", "--cwd", root, ...(pkg ? ["--filter", pkg] : [])]
        await exec(args)
      },
    }),
    test: defineCommand({
      meta: {
        name: "test",
        description: "Run vitest (extra args passthrough); --bun also runs `bun test`",
      },
      args: {
        bun: { type: "boolean", description: "Also run `bun test` before vitest", default: false },
      },
      run: async ({ args, rawArgs }) => {
        const pkg = currentPackage()
        const extras = rawArgs.filter((a) => a !== "--bun")
        if (pkg) {
          if (args.bun) await exec(["bun", "test"])
          await exec(["vitest", "-r", root, "--project", pkg, "run", ...extras])
        } else {
          if (args.bun) await exec(["bun", "test", "--no-env-file"], root)
          await exec(["vitest", "run", ...extras], root)
        }
      },
    }),
    lint: defineCommand({
      meta: {
        name: "lint",
        description: "Lint with oxlint -f stylish (extra args passthrough)",
      },
      run: async ({ rawArgs }) => {
        await exec(["oxlint", "-f", "stylish", ...rawArgs])
      },
    }),
    fmt: defineCommand({
      meta: {
        name: "fmt",
        description: "Format with oxfmt (extra args passthrough)",
      },
      run: async ({ rawArgs }) => {
        await exec(["oxfmt", ...rawArgs])
      },
    }),
    api: defineCommand({
      meta: {
        name: "api",
        description: "Generate API surface reports (etc/<pkg>.api.md)",
      },
      args: {
        check: {
          type: "boolean",
          description: "Fail if reports drifted (CI mode)",
          default: process.env.CI === "true",
        },
      },
      run: async ({ args }) => {
        const { runApi } = await import("./api.ts")
        const ok = runApi({ root, slug: currentSlug(), check: args.check })
        if (!ok) process.exit(1)
      },
    }),
  },
})

await runMain(main, {
  showUsage: async (cmd) => {
    const meta = await cmd.meta
    if (passthrough.has(meta?.name ?? "")) {
      await runCommand(cmd, { rawArgs: ["--help"] })
      return
    }
    await showUsage(cmd)
  },
})
