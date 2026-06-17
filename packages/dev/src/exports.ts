/**
 * Generate flat export reports (`etc/<pkg>[-<subpath>].exports.md`) for
 * one or more packages.
 *
 * For each subpath in a package's `exports` map we resolve via the
 * package name (`@zaly/foo` / `@zaly/foo/bar`) — the same path
 * consumers use. Bun's resolver picks up the source `.ts` in dev
 * mode, so no build is required. The resolved file feeds ts-morph for
 * the type-side surface; the same specifier is `await import()`-ed
 * for the runtime keyset.
 *
 * Each export lands in exactly one bucket, in priority order:
 *
 *   Classes > Functions > Constants > Types
 *
 * So a class with an associated type goes under Classes; a callable
 * `const` goes under Functions; a plain value under Constants; and
 * everything else (interfaces, type aliases) under Types. Names that
 * exist in the type surface but NOT in the runtime import shift to
 * `Types Classes` / `Types Functions` / `Types Constants` / `Types`
 * to make the runtime-vs-type-only split obvious.
 *
 * Output is alphabetised within each bucket for stable diffs.
 */

// oxlint-disable sort-keys

import type { ExportedDeclarations } from "ts-morph"
import type { Runtime } from "./cli.ts"
import type { Pkg } from "./utils.ts"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "pathe"
import { Project, SyntaxKind } from "ts-morph"
import { API_PACKAGES } from "./api.ts"

type ExportEntry = {
  name: string
  path: string
  pkgDir: string
}

const BUCKET_ORDER = [
  "Classes",
  "Functions",
  "Constants",
  "Types Classes",
  "Types Functions",
  "Types Constants",
  "Types",
] as const
type Bucket = (typeof BUCKET_ORDER)[number]
type SyntacticBucket = "Classes" | "Functions" | "Constants" | "Types"

/** Build the importable specifier for a subpath:
 *    "."       → "@zaly/foo"
 *    "./bar"   → "@zaly/foo/bar"
 *  Same shape consumers use; Bun's resolver applies `package.json#exports`
 *  to land on the source file in dev mode. */
function specifier(pkgName: string, subpath: string): string {
  return subpath === "." ? pkgName : `${pkgName}${subpath.slice(1)}`
}

/** Bucket selection: Class > Function > Constant > Type. A symbol with
 *  multiple declarations (e.g. a class merged with an interface) lands
 *  in the highest-priority bucket its declarations support. Variables
 *  whose value type has construct signatures count as Classes (covers
 *  the `const Foo = ... as new () => ...` pattern); call signatures
 *  count as Functions. */
function classify(decls: readonly ExportedDeclarations[]): SyntacticBucket {
  let hasFunction = false
  let hasConstant = false
  let hasType = false
  for (const d of decls) {
    const kind = d.getKind()
    if (kind === SyntaxKind.ClassDeclaration) return "Classes"
    if (
      kind === SyntaxKind.FunctionDeclaration ||
      kind === SyntaxKind.MethodDeclaration ||
      kind === SyntaxKind.ArrowFunction
    ) {
      hasFunction = true
      continue
    }
    if (kind === SyntaxKind.VariableDeclaration) {
      const type = d.getType()
      if (type.getConstructSignatures().length > 0) return "Classes"
      if (type.getCallSignatures().length > 0) hasFunction = true
      else hasConstant = true
      continue
    }
    if (
      kind === SyntaxKind.InterfaceDeclaration ||
      kind === SyntaxKind.TypeAliasDeclaration ||
      kind === SyntaxKind.EnumDeclaration
    ) {
      hasType = true
      continue
    }
    // Fallback: namespace exports / module declarations / etc. — treat
    // as Constants (closest to "value-shaped").
    hasConstant = true
  }
  if (hasFunction) return "Functions"
  if (hasConstant) return "Constants"
  if (hasType) return "Types"
  return "Constants"
}

async function generateReport(entry: ExportEntry, runtime: Runtime): Promise<string> {
  // Same resolution path consumers use. `import.meta.resolve` returns
  // a `file://` URL; convert to a path for ts-morph. The dynamic
  // `import()` exercises the same resolver, so the runtime keyset
  // and the type surface are guaranteed to come from the same file.
  const runtimeKeys = new Set(Object.keys(await import(entry.path)))

  const project = new Project({
    skipAddingFilesFromTsConfig: false,
    skipFileDependencyResolution: false,
    skipLoadingLibFiles: true,
    tsConfigFilePath: join(entry.pkgDir, "tsconfig.json"),
    compilerOptions: {
      customConditions: [runtime],
    },
  })
  const sourcePath = entry.path.replace(/\.mjs$/, ".d.mts")
  const sourceFile = project.addSourceFileAtPath(sourcePath)

  const buckets: Record<Bucket, string[]> = {
    Classes: [],
    Functions: [],
    Constants: [],
    "Types Classes": [],
    "Types Functions": [],
    "Types Constants": [],
    Types: [],
  }

  for (const [name, decls] of sourceFile.getExportedDeclarations()) {
    const syn = classify(decls)
    let bucket: Bucket
    if (runtimeKeys.has(name)) {
      bucket = syn
    } else if (syn === "Types") {
      bucket = "Types"
    } else {
      // Type-only declaration whose syntactic shape is a class /
      // function / const — bucket separately so the report
      // distinguishes "consumer can construct it" from "consumer can
      // only annotate with it."
      bucket = `Types ${syn}` as Bucket
    }
    buckets[bucket].push(name)
  }

  for (const k of BUCKET_ORDER) buckets[k].sort()

  const total = BUCKET_ORDER.reduce((n, k) => n + buckets[k].length, 0)
  const header = entry.name
  const lines: string[] = [`# ${header} (${total})`, ""]
  for (const k of BUCKET_ORDER) {
    if (buckets[k].length === 0) continue
    lines.push(`## ${k} (${buckets[k].length})`, "")
    for (const n of buckets[k]) lines.push(`- ${n}`)
    lines.push("")
  }
  return `${lines.join("\n").trimEnd()}\n`
}

async function reportForPackage(pkg: Pkg, check: boolean, runtime: Runtime): Promise<boolean> {
  const pkgDir = pkg.dir
  console.log(`Generating exports report for ${pkg.name}...`)
  mkdirSync(join(pkgDir, "etc"), { recursive: true })
  const entries: ExportEntry[] = []

  for (const [n, e] of Object.entries(pkg.exports)) {
    const f = typeof e === "string" ? e : (e[runtime] ?? e.default)
    if (!f) throw new Error(`No export path for runtime "${runtime}" in export "${n}"`)
    entries.push({
      name: specifier(pkg.name, n),
      path: join(pkgDir, f),
      pkgDir,
    })
  }

  let allOk = true

  for (const entry of entries) {
    let md: string
    try {
      // oxlint-disable-next-line no-await-in-loop
      md = await generateReport(entry, runtime)
    } catch (error) {
      console.error(`  failed to resolve ${entry.name}: ${(error as Error).message}`)
      allOk = false
      continue
    }
    const reportName = entry.name.replace("@zaly/", "").replace(/\//g, "-")
    const outPath = join(pkgDir, "etc", `${reportName}.exports.md`)

    if (check) {
      const existing = existsSync(outPath) ? readFileSync(outPath, "utf8") : ""
      if (existing !== md) {
        console.error(`  drift: ${outPath}`)
        allOk = false
      }
      continue
    }
    writeFileSync(outPath, md)
  }
  return allOk
}

export async function runExports(
  pkgs: Pkg[],
  opts: {
    check: boolean
    runtime?: Runtime
  }
): Promise<boolean> {
  let allOk = true
  for (const pkg of pkgs) {
    if (!API_PACKAGES.includes(pkg.slug as (typeof API_PACKAGES)[number])) {
      console.warn(`Skipping \`${pkg.name}\` — not in API_PACKAGES list`)
      continue
    }
    // oxlint-disable-next-line no-await-in-loop
    if (!(await reportForPackage(pkg, opts.check, opts.runtime ?? "bun"))) allOk = false
  }
  return allOk
}
