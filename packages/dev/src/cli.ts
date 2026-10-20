// oxlint-disable no-await-in-loop
// oxlint-disable unicorn/prefer-ternary
// oxlint-disable sort-keys

import type { Pkg } from "./utils.ts"

import { defineCommand, runCommand, runMain, showUsage } from "citty"
import { existsSync } from "node:fs"
import { join } from "pathe"
import { isAgent } from "std-env"
import { allPkgs, findPkg, resolvePkgs, workspace } from "./utils.ts"

const passthrough = new Set(["test", "lint", "fmt"])

export type Runtime = "bun" | "node"

async function exec(cmd: string[], cwd: string = process.cwd()): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdio: ["inherit", "inherit", "inherit"] })
  const code = await proc.exited
  if (code !== 0) process.exit(code)
}

async function runScripts(script: string, pkg?: Pkg): Promise<void> {
  const args = [
    "bun",
    "run",
    "--sequential",
    "--if-present",
    "--no-exit-on-error",
    pkg && !pkg.root ? `--filter=${pkg.name}` : "--workspaces",
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
        schemas: {
          type: "boolean",
          description: "Also generate validators and JSON schemas (if applicable)",
          default: true,
        },
      },
      run: async ({ args }) => {
        if (args.schemas) {
          const { generateSchemas } = await import("./schemas.ts")
          for (const pkg of await resolvePkgs()) await generateSchemas(pkg.dir)
        }
        const pkg = await findPkg()
        if (args.scripts) await runScripts("build:*", pkg)
        await exec(["tsdown", "--cwd", workspace, ...(pkg ? ["--filter", pkg.name] : [])])
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
        for (const pkg of await resolvePkgs()) {
          console.log(`Updating ${pkg.name}...`)
          await exec(["bun", "update", "--cwd", pkg.dir, "--latest"])
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
        const pkg = await findPkg()
        const extras = rawArgs.filter((a) => a !== "--bun")
        if (args.bun) await exec(["bun", "test"])
        if (pkg) {
          await exec(["vitest", "-r", workspace, "--project", pkg.name, "run", ...extras])
        } else {
          await exec(["vitest", "run", ...extras], workspace)
        }
      },
    }),
    lint: defineCommand({
      meta: {
        name: "lint",
        description: "Lint with oxlint -f stylish (extra args passthrough)",
      },
      run: async ({ rawArgs }) => {
        const workflows = rawArgs.filter((arg) => arg.startsWith(".github/workflows/"))
        const sourceArgs = rawArgs.filter((arg) => !workflows.includes(arg))
        if (process.cwd() === workspace && (rawArgs.length === 0 || workflows.length > 0)) {
          await exec(["actionlint", ...workflows], workspace)
        }
        if (workflows.length === 0 || sourceArgs.length > 0) {
          await exec(["oxlint", ...(isAgent ? [] : ["-f", "stylish"]), ...sourceArgs])
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
    pack: defineCommand({
      meta: { name: "pack", description: "Pack public packages and write a release manifest" },
      args: {
        out: { type: "string", required: true, description: "Artifact directory" },
      },
      run: async ({ args }) => {
        const { packRelease } = await import("./pack.ts")
        await packRelease(await allPkgs(), {
          dir: args.out,
          root: workspace,
        })
      },
    }),
    publish: defineCommand({
      meta: {
        name: "publish",
        description: "Publish public packages to npm, skipping versions that already exist",
      },
      args: {
        artifacts: { type: "string", description: "Publish prebuilt artifacts without repacking" },
        "dry-run": {
          type: "boolean",
          description: "Run npm publish --dry-run",
          default: false,
        },
        otp: {
          type: "string",
          description: "Forward an npm one-time password",
        },
        provenance: {
          type: "boolean",
          description: "Publish with npm provenance (defaults to true on GitHub Actions)",
          default: process.env.GITHUB_ACTIONS === "true",
        },
        tag: {
          type: "string",
          description: "Publish with a specific npm dist-tag",
        },
      },
      run: async ({ args }) => {
        const { publish, publishArtifacts } = await import("./publish.ts")
        const opts = {
          root: workspace,
          dryRun: args["dry-run"],
          otp: args.otp,
          provenance: args.provenance,
          tag: args.tag,
        }
        if (args.artifacts) {
          await publishArtifacts(args.artifacts, opts)
        } else {
          await publish(await resolvePkgs(), opts)
        }
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
        const pkgs = await resolvePkgs()
        if (args.imports) {
          await runImports(pkgs, { exec, runtime: args.node ? "node" : "bun" })
          return
        }
        const dirs = pkgs.map((pkg) => join(pkg.dir, "bench")).filter((d) => existsSync(d))
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
        const ok = runApi(await resolvePkgs(), { check: args.check })
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
        const ok = await runExports(await resolvePkgs(), {
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
