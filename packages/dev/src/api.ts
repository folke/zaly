/**
 * Generate API surface reports (`etc/<pkg>[-<subpath>].api.md`) for one or
 * more packages. Entries are derived from each package's
 * `package.json#exports` field — add a sub-path there and a report appears
 * automatically. No per-package `api-extractor.json` needed.
 */

// oxlint-disable sort-keys

import type { IConfigFile } from "@microsoft/api-extractor"
import type { Pkg, PkgExport } from "./utils.ts"

import { Extractor, ExtractorConfig, ExtractorLogLevel } from "@microsoft/api-extractor"
import { mkdirSync } from "node:fs"
import { join } from "pathe"

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

function entryTarget(t: PkgExport): string | undefined {
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

function reportForPackage(pkg: Pkg, check: boolean): boolean {
  const pkgDir = pkg.dir
  console.log(`Generating API report for ${pkg.name}...`)

  mkdirSync(join(pkgDir, "etc"), { recursive: true })
  // `publishConfig.exports` carries the dist-shape (`./dist/*.mjs`); use
  // it when present so we don't have to mirror tsdown's output layout
  // ourselves. Falls back to the dev `exports` field for packages that
  // don't override.
  const exportEntries = Object.entries(pkg.publishExports)
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
      packageJsonFullPath: join(pkgDir, "package.json"),
    })

    const result = Extractor.invoke(config, {
      localBuild: !check,
      showVerboseMessages: false,
    })
    if (!result.succeeded) allOk = false
  }
  return allOk
}

export function runApi(pkgs: Pkg[], opts: { check: boolean }): boolean {
  let allOk = true
  for (const pkg of pkgs) {
    if (!API_PACKAGES.includes(pkg.slug as (typeof API_PACKAGES)[number])) {
      console.warn(`Skipping \`${pkg.name}\` — not in API_PACKAGES list`)
      continue
    }
    if (!reportForPackage(pkg, opts.check)) allOk = false
  }
  return allOk
}
