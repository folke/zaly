// oxlint-disable no-await-in-loop
// oxlint-disable unicorn/prefer-ternary
// oxlint-disable sort-keys

import { defineCommand, runCommand, runMain, showUsage } from "citty"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve } from "pathe"
import { isAgent as ia } from "std-env"

const isAgent = ia || process.env.ZALY === "1"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const passthrough = new Set(["test", "lint", "fmt"])

export type Runtime = "bun" | "node"

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

function allPackageDirs(): string[] {
  const pkgsRoot = join(root, "packages")
  return readdirSync(pkgsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(pkgsRoot, d.name, "package.json")))
    .map((d) => join(pkgsRoot, d.name))
    .toSorted()
}

function pkgDirs(opts: { root?: boolean } = {}): string[] {
  const slug = currentSlug()
  const ret = slug ? [join(root, "packages", slug)] : allPackageDirs()
  if (!slug && opts.root) ret.unshift(root)
  return ret
}

async function exec(cmd: string[], cwd: string = process.cwd()): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdio: ["inherit", "inherit", "inherit"] })
  const code = await proc.exited
  if (code !== 0) process.exit(code)
}

async function runScripts(script: string, pkg?: string): Promise<void> {
  const args = [
    "bun",
    "run",
    "--sequential",
    "--if-present",
    "--no-exit-on-error",
    pkg ? `--filter=${pkg}` : "--workspaces",
    script,
  ]
  await exec(args)
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
      args: {
        scripts: {
          type: "boolean",
          description: "Also run `build:*` scripts before tsdown",
          default: true,
        },
        typia: {
          type: "boolean",
          description: "Also build typia validators and JSON schemas (if applicable)",
          default: true,
        },
      },
      run: async ({ args }) => {
        const pkg = currentPackage()
        if (args.typia) {
          const { compile, generateJsonSchemas, hasSchemas } = await import("./typia.ts")
          for (const dir of pkgDirs()) {
            if (!hasSchemas(dir)) continue
            await compile(dir)
            await generateJsonSchemas(dir)
          }
        }
        if (args.scripts) await runScripts("build:*", pkg)
        await exec(["tsdown", "--cwd", root, ...(pkg ? ["--filter", pkg] : [])])
      },
    }),
    update: defineCommand({
      meta: {
        name: "update",
        alias: ["up"],
        description: "Update the current package (or all when run from root)",
      },
      run: async () => {
        await exec(["bun", "update", "-r", "--latest"])
        for (const dir of pkgDirs()) {
          console.log(`Updating ${dir}...`)
          await exec(["bun", "update", "--cwd", dir, "--latest"])
        }
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
        if (args.bun) await exec(["bun", "test"])
        if (pkg) {
          await exec(["vitest", "-r", root, "--project", pkg, "run", ...extras])
        } else {
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
        if (isAgent) {
          await exec(["oxlint", ...rawArgs])
        } else {
          await exec(["oxlint", "-f", "stylish", ...rawArgs])
        }
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
    bench: defineCommand({
      meta: {
        name: "bench",
        description:
          "Run mitata `*.bench.ts` under bench/; --imports times cold `bun -e 'import X'` via hyperfine",
      },
      args: {
        pattern: { type: "positional", required: false, description: "Substring or glob filter" },
        imports: {
          type: "boolean",
          description: "Bench cold imports (deps + exports) via hyperfine",
          default: false,
        },
        node: {
          type: "boolean",
          description: "Use the node runtime instead of bun for imports benchmark",
        },
      },
      run: async ({ args }) => {
        const { runMitata, runImports } = await import("./bench.ts")
        const pdirs = pkgDirs()
        if (args.imports) {
          await runImports({ pkgDirs: pdirs, exec }, args.node ? "node" : "bun")
          return
        }
        const dirs = pdirs.map((d) => join(d, "bench")).filter((d) => existsSync(d))
        const ok = await runMitata({ dirs, pattern: args.pattern })
        if (!ok) process.exit(1)
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
    exports: defineCommand({
      meta: {
        name: "exports",
        description: "Generate flat export reports (etc/<pkg>.exports.md)",
      },
      args: {
        check: {
          type: "boolean",
          description: "Fail if reports drifted (CI mode)",
          default: process.env.CI === "true",
        },
        node: {
          type: "boolean",
          description: "Use the node runtime instead of bun for imports benchmark",
        },
      },
      run: async ({ args }) => {
        const { runExports } = await import("./exports.ts")
        const ok = await runExports({
          root,
          slug: currentSlug(),
          check: args.check,
          runtime: args.node ? "node" : "bun",
        })
        if (!ok) process.exit(1)
      },
    }),
  },
})

export async function run() {
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
}
