/**
 * Generate API surface reports (`etc/<pkg>[-<subpath>].api.md`) for every
 * package in the monorepo. Entries are derived from each package's
 * `package.json#exports` field — add a sub-path there and a report
 * appears automatically. No per-package `api-extractor.json` needed.
 *
 * Usage:
 *   bun scripts/api-report.ts          # update reports in place (dev)
 *   CI=true bun scripts/api-report.ts  # fail if any report drifted (CI)
 */

import type { IConfigFile } from "@microsoft/api-extractor"

import { Extractor, ExtractorConfig, ExtractorLogLevel } from "@microsoft/api-extractor"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

interface PackageJson {
  name: string
  exports?: Record<string, ExportTarget>
  publishConfig?: { exports?: Record<string, ExportTarget> }
}

type ExportTarget = string | { default?: string; types?: string; import?: string }

// `@zaly/cli` is a leaf binary, not consumed externally — skip it.
const PACKAGES = ["agent", "ai", "shared", "tui"]
const ROOT = resolve(import.meta.dir, "..")

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

function reportForPackage(pkgSlug: string): boolean {
  const pkgDir = join(ROOT, "packages", pkgSlug)
  const pkgPath = join(pkgDir, "package.json")
  if (!existsSync(pkgPath)) return true

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
    const dts = out.endsWith(".mjs") ? mjsToDts(out) : out.endsWith(".d.mts") ? out : undefined
    if (!dts) continue

    const config = ExtractorConfig.prepare({
      configObject: configFor(pkgDir, pkg.name, subpath, dts),
      configObjectFullPath: join(pkgDir, "api-extractor.json"),
      packageJsonFullPath: pkgPath,
    })

    const result = Extractor.invoke(config, {
      localBuild: process.env.CI !== "true",
      showVerboseMessages: false,
    })
    if (!result.succeeded) allOk = false
  }
  return allOk
}

let allOk = true
for (const pkg of PACKAGES) {
  if (!reportForPackage(pkg)) allOk = false
}
if (!allOk) process.exit(1)
