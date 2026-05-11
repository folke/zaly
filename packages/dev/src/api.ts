/**
 * Generate API surface reports (`etc/<pkg>[-<subpath>].api.md`) for one or
 * more packages. Entries are derived from each package's
 * `package.json#exports` field — add a sub-path there and a report appears
 * automatically. No per-package `api-extractor.json` needed.
 */

// oxlint-disable sort-keys

import type { IConfigFile } from "@microsoft/api-extractor"

import { Extractor, ExtractorConfig, ExtractorLogLevel } from "@microsoft/api-extractor"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "pathe"

interface PackageJson {
  name: string
  exports?: Record<string, ExportTarget>
  publishConfig?: { exports?: Record<string, ExportTarget> }
}

type ExportTarget = string | { default?: string; types?: string; import?: string }

// `@zaly/cli` is a leaf binary, not consumed externally — skip it.
export const API_PACKAGES = ["agent", "ai", "shared", "tui"] as const

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

function configFor(pkgDir: string, pkgName: string, subpath: string, dts: string): IConfigFile {
  return {
    projectFolder: pkgDir,
    mainEntryPointFilePath: dts,
    compiler: {
      tsconfigFilePath: join(pkgDir, "tsconfig.json"),
    },
    apiReport: {
      enabled: true,
      reportFileName: reportName(pkgName, subpath),
      reportFolder: "<projectFolder>/etc/",
      reportTempFolder: "<projectFolder>/temp/",
    },
    docModel: { enabled: false },
    dtsRollup: { enabled: false },
    tsdocMetadata: { enabled: false },
    messages: {
      // Restore the template defaults — supplying a partial `messages`
      // object replaces (not merges) the baked-in `warning` levels, which
      // would otherwise silence compiler + TSDoc diagnostics.
      compilerMessageReporting: {
        default: { logLevel: ExtractorLogLevel.Warning },
      },
      extractorMessageReporting: {
        default: { logLevel: ExtractorLogLevel.Warning },
        "ae-missing-release-tag": { logLevel: ExtractorLogLevel.None },
        "ae-undocumented": { logLevel: ExtractorLogLevel.None },
      },
      tsdocMessageReporting: {
        default: { logLevel: ExtractorLogLevel.Warning },
      },
    },
  }
}

function reportForPackage(root: string, slug: string, check: boolean): boolean {
  const pkgDir = join(root, "packages", slug)
  const pkgPath = join(pkgDir, "package.json")
  if (!existsSync(pkgPath)) return true

  console.log(`Generating API report for @zaly/${slug}...`)

  const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, "utf8"))
  mkdirSync(join(pkgDir, "etc"), { recursive: true })
  // `publishConfig.exports` carries the dist-shape (`./dist/*.mjs`); use
  // it when present so we don't have to mirror tsdown's output layout
  // ourselves. Falls back to the dev `exports` field for packages that
  // don't override.
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

    const config = ExtractorConfig.prepare({
      configObject: configFor(pkgDir, pkg.name, subpath, dts),
      configObjectFullPath: join(pkgDir, "api-extractor.json"),
      packageJsonFullPath: pkgPath,
    })

    const result = Extractor.invoke(config, {
      localBuild: !check,
      showVerboseMessages: false,
    })
    if (!result.succeeded) allOk = false
  }
  return allOk
}

export function runApi(opts: { root: string; slug?: string; check: boolean }): boolean {
  if (opts.slug && !API_PACKAGES.includes(opts.slug as (typeof API_PACKAGES)[number])) {
    process.stderr.write(`no API report defined for @zaly/${opts.slug}\n`)
    return true
  }
  const targets = opts.slug ? [opts.slug] : [...API_PACKAGES]
  let allOk = true
  for (const slug of targets) {
    if (!reportForPackage(opts.root, slug, opts.check)) allOk = false
  }
  return allOk
}
