/**
 * Generate flat export reports (`etc/<pkg>[-<subpath>].exports.md`) for
 * one or more packages. Entries are derived from each package's
 * `package.json#exports` (mirroring `api.ts`), and parsed via ts-morph
 * from the rolled-up `.d.mts` declaration file — i.e. the actual public
 * surface, not the source's full namespace.
 *
 * Each export lands in exactly one bucket, in priority order:
 *
 *   Classes > Functions > Constants > Types
 *
 * So a class with an associated type goes under Classes; a callable
 * `const` goes under Functions; a plain value under Constants; and
 * everything else (interfaces, type aliases) under Types.
 *
 * Output is alphabetised within each bucket for stable diffs.
 */

// oxlint-disable sort-keys

import type { ExportedDeclarations } from "ts-morph"

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "pathe"
import { Project, SyntaxKind } from "ts-morph"
import { API_PACKAGES } from "./api.ts"

interface PackageJson {
  name: string
  exports?: Record<string, ExportTarget>
  publishConfig?: { exports?: Record<string, ExportTarget> }
}

type ExportTarget = string | { default?: string; types?: string; import?: string }

const BUCKET_ORDER = ["Classes", "Functions", "Constants", "Types"] as const
type Bucket = (typeof BUCKET_ORDER)[number]

function reportName(pkgName: string, subpath: string): string {
  const base = pkgName.split("/").pop()!
  if (subpath === ".") return base
  return `${base}-${subpath.replace(/^\.\//, "").replace(/\//g, "-")}`
}

function mjsToDts(mjs: string): string {
  return mjs.replace(/\.mjs$/, ".d.mts")
}

function entryTarget(t: ExportTarget): string | undefined {
  if (typeof t === "string") return t
  return t.types ?? t.default ?? t.import
}

/** Bucket selection: Class > Function > Constant > Type. A symbol with
 *  multiple declarations (e.g. a class merged with an interface) lands
 *  in the highest-priority bucket its declarations support. Variables
 *  whose value type has construct signatures count as Classes (covers
 *  the `const Foo = ... as new () => ...` pattern); call signatures
 *  count as Functions. */
function classify(decls: readonly ExportedDeclarations[]): Bucket {
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

function generateReport(pkgName: string, subpath: string, dtsPath: string): string {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    skipLoadingLibFiles: true,
  })
  const sourceFile = project.addSourceFileAtPath(dtsPath)

  const buckets: Record<Bucket, string[]> = {
    Classes: [],
    Functions: [],
    Constants: [],
    Types: [],
  }

  for (const [name, decls] of sourceFile.getExportedDeclarations()) {
    buckets[classify(decls)].push(name)
  }

  for (const k of BUCKET_ORDER) buckets[k].sort()

  const total = BUCKET_ORDER.reduce((n, k) => n + buckets[k].length, 0)
  const header = subpath === "." ? pkgName : `${pkgName}/${subpath.replace(/^\.\//, "")}`
  const lines: string[] = [`# ${header} (${total})`, ""]
  for (const k of BUCKET_ORDER) {
    if (buckets[k].length === 0) continue
    lines.push(`## ${k} (${buckets[k].length})`, "")
    for (const n of buckets[k]) lines.push(`- ${n}`)
    lines.push("")
  }
  return `${lines.join("\n").trimEnd()}\n`
}

function reportForPackage(root: string, slug: string, check: boolean): boolean {
  const pkgDir = join(root, "packages", slug)
  const pkgPath = join(pkgDir, "package.json")
  if (!existsSync(pkgPath)) return true

  console.log(`Generating exports report for @zaly/${slug}...`)

  const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, "utf8"))
  mkdirSync(join(pkgDir, "etc"), { recursive: true })

  const publishExports = pkg.publishConfig?.exports
  const exportEntries = Object.entries(publishExports ?? pkg.exports ?? {})
  let allOk = true

  for (const [subpath, target] of exportEntries) {
    if (subpath === "./package.json") continue
    const out = entryTarget(target)
    if (!out) continue
    let dts = out.endsWith(".mjs") ? mjsToDts(out) : undefined
    dts ??= out.endsWith(".d.mts") ? out : undefined
    if (!dts) continue

    const dtsAbs = join(pkgDir, dts)
    if (!existsSync(dtsAbs)) {
      console.warn(`  skip ${subpath}: ${dts} not found (build first)`)
      continue
    }

    const md = generateReport(pkg.name, subpath, dtsAbs)
    const outPath = join(pkgDir, "etc", `${reportName(pkg.name, subpath)}.exports.md`)

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

export function runExports(opts: { root: string; slug?: string; check: boolean }): boolean {
  if (opts.slug && !API_PACKAGES.includes(opts.slug as (typeof API_PACKAGES)[number])) {
    process.stderr.write(`no exports report defined for @zaly/${opts.slug}\n`)
    return true
  }
  const targets = opts.slug ? [opts.slug] : [...API_PACKAGES]
  let allOk = true
  for (const slug of targets) {
    if (!reportForPackage(opts.root, slug, opts.check)) allOk = false
  }
  return allOk
}
