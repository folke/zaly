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

import { run } from "mitata"
import { globSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "pathe"

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  exports?: Record<string, unknown>
}

function readPkg(pkgDir: string): PackageJson {
  return JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as PackageJson
}

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

function importSpecs(pkgDir: string): string[] {
  const pkg = readPkg(pkgDir)
  let specs: string[] = []
  for (const dep of Object.keys(pkg.dependencies ?? {})) specs.push(dep)
  for (const dep of Object.keys(pkg.optionalDependencies ?? {})) specs.push(dep)
  for (const dep of Object.keys(pkg.peerDependencies ?? {})) specs.push(dep)
  for (const dep of Object.keys(pkg.devDependencies ?? {})) specs.push(dep)
  specs = specs.filter((s) => !s.startsWith("@types/"))
  if (pkg.name) {
    for (const sub of Object.keys(pkg.exports ?? {})) {
      if (sub === "./package.json" || sub.startsWith("./zaly")) continue
      specs.push(sub === "." ? pkg.name : `${pkg.name}${sub.slice(1)}`)
    }
  }
  return specs.toSorted()
}

export interface RunImportsOpts {
  pkgDirs: string[]
  exec: (cmd: string[], cwd?: string) => Promise<void>
}

export async function runImports(opts: RunImportsOpts, runtime?: Runtime): Promise<void> {
  runtime ??= "bun"
  const { markdown, createRender } = await import("@zaly/tui")
  const tmpRoot = mkdtempSync(join(tmpdir(), "z-bench-imports-"))
  try {
    for (const dir of opts.pkgDirs) {
      const specs = importSpecs(dir)
      if (specs.length === 0) continue
      const pkgName = readPkg(dir).name ?? dir
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
        dir
      )
      const md = readFileSync(out, "utf8")
      const rows = await createRender(() => markdown(md))
      process.stdout.write(`\n${rows.join("\n")}`)
    }
  } finally {
    rmSync(tmpRoot, { force: true, recursive: true })
  }
}
