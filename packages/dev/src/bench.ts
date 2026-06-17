// oxlint-disable no-await-in-loop
/**
 * `z bench` runners.
 *
 * - `runMitata`: glob `*.bench.ts` under one or more `bench/` dirs and
 *   import them; mitata's `bench(...)` registrations accumulate globally,
 *   so a single `run()` at the end prints a combined report.
 * - `runImports`: builds a single `hyperfine` invocation that benchmarks
 *   `bun -e 'import "<spec>"'` for every dep + every package-name export
 *   subpath. One process per package keeps the comparison table local.
 */

import type { Runtime } from "./cli.ts"
import type { Pkg } from "./utils.ts"

import { run } from "mitata"
import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "pathe"

function expandPattern(arg?: string): string {
  if (!arg) return "*.bench.ts"
  return /[*?[]/.test(arg) || arg.endsWith(".bench.ts") ? arg : `*${arg}*.bench.ts`
}

async function importFromDir(benchDir: string, pattern: string): Promise<number> {
  const files = globSync(pattern, { cwd: benchDir }).toSorted()
  for (const file of files) await import(resolve(benchDir, file))
  return files.length
}

export async function runMitata(opts: { dirs: string[]; pattern?: string }): Promise<boolean> {
  const pattern = expandPattern(opts.pattern)
  let total = 0
  for (const d of opts.dirs) total += await importFromDir(d, pattern)
  if (total === 0) {
    process.stderr.write(`no bench files matched pattern: ${pattern}\n`)
    return false
  }
  await run()
  return true
}

function importSpecs(pkg: Pkg): string[] {
  let specs: string[] = []
  for (const dep of Object.keys(pkg.json.dependencies ?? {})) specs.push(dep)
  for (const dep of Object.keys(pkg.json.optionalDependencies ?? {})) specs.push(dep)
  for (const dep of Object.keys(pkg.json.peerDependencies ?? {})) specs.push(dep)
  for (const dep of Object.keys(pkg.json.devDependencies ?? {})) specs.push(dep)
  specs = specs.filter((s) => !s.startsWith("@types/"))
  if (pkg.name) {
    for (const sub of Object.keys(pkg.json.exports ?? {})) {
      if (sub === "./package.json" || sub.startsWith("./zaly")) continue
      specs.push(sub === "." ? pkg.name : `${pkg.name}${sub.slice(1)}`)
    }
  }
  return specs.toSorted()
}

export interface RunImportsOpts {
  exec: (cmd: string[], cwd?: string) => Promise<void>
  runtime?: Runtime
}

export async function runImports(pkgs: Pkg[], opts: RunImportsOpts): Promise<void> {
  const runtime = opts.runtime ?? "bun"
  const { createRender } = await import("@zaly/tui")
  const { markdown } = await import("@zaly/tui/widgets/markdown")
  const tmpRoot = mkdtempSync(join(tmpdir(), "z-bench-imports-"))
  try {
    for (const pkg of pkgs) {
      const specs = importSpecs(pkg)
      if (specs.length === 0) continue
      const pkgName = pkg.name
      process.stdout.write(`\n── ${pkgName} ──\n`)
      const cases = [`${runtime} -e ' '`, ...specs.map((s) => `${runtime} -e 'import "${s}"'`)]
      const names = [runtime, ...specs].flatMap((s) => ["-n", s])
      const out = join(tmpRoot, `${pkgName.replace(/[@/]/g, "_")}.md`)
      await opts.exec(
        [
          "hyperfine",
          "--warmup",
          "3",
          "--runs",
          "10",
          "--export-markdown",
          out,
          ...cases,
          ...names,
        ],
        pkg.dir
      )
      const md = readFileSync(out, "utf8")
      const rows = await createRender(() => markdown(md))
      process.stdout.write(`\n${rows.join("\n")}`)
    }
  } finally {
    rmSync(tmpRoot, { force: true, recursive: true })
  }
}
