import type { PackageJson, PackageJsonExports } from "pkg-types"

import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { basename, dirname, join, resolve } from "pathe"
import { readPackageJSON, resolvePackageJSON } from "pkg-types"

export type PackageJsonExportKey =
  | "."
  | "import"
  | "require"
  | "types"
  | "node"
  | "browser"
  | "default"
  | (string & {})

// oxlint-disable-next-line typescript/consistent-indexed-object-style
export type PkgExport = { [K in PackageJsonExportKey]?: string }
export type PkgExports = Record<string, PkgExport>

export type Pkg = {
  dir: string
  json: PackageJson
  name: string
  root?: boolean
  slug: string
  workspaceDeps: string[]
  exports: PkgExports
  publishExports: PkgExports
}

export type PkgOpts = {
  /** Current working directory to start searching from. Defaults to process.cwd() */
  cwd?: string
  /** Whether to include the root package. Defaults to false */
  root?: boolean
  /** Filter packages by name/slug. Defaults to undefined (no filter) */
  filter?: string
}

export const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")

const conditions = new Set(["import", "require", "types", "node", "browser", "default"])

function first<T>(value: T | T[]): T | undefined {
  return Array.isArray(value) ? value[0] : value
}

function resolveExports(exports: PackageJsonExports): PkgExports {
  const value = first(exports)
  if (!value) return {}

  if (typeof value === "string") return { ".": { default: value } }

  const entries = Object.entries(value)

  // Top-level condition map: { import, require, default }
  if (entries.every(([key]) => conditions.has(key))) {
    return { ".": resolveConditions(".", value) }
  }

  const ret: PkgExports = {}
  for (const [key, target] of entries) {
    if (key.includes("package.json")) continue
    const v = first(target)
    if (!v) continue
    ret[key] = typeof v === "string" ? { default: v } : resolveConditions(key, v)
  }
  return ret
}

function resolveConditions(
  key: string,
  value: PackageJsonExports & object
): Record<string, string> {
  const ret: Record<string, string> = {}
  for (const [condition, target] of Object.entries(value)) {
    const v = first(target)
    if (typeof v !== "string") {
      throw new Error(`Unsupported export target for "${key}" export: ${JSON.stringify(target)}`)
    }
    ret[condition] = v
  }
  return ret
}

/** Finds the closest package.json and returns its info */
export async function findPkg(opts: PkgOpts = {}): Promise<Pkg | undefined> {
  let dir = resolve(opts.cwd ?? process.cwd())
  if (!(opts.root ?? false) && dir === workspace) return
  let pkgJson: string
  try {
    pkgJson = await resolvePackageJSON(resolve(dir))
  } catch {
    return
  }
  dir = resolve(dirname(pkgJson))
  const json = await readPackageJSON(dir)
  if (!json.name) throw new Error(`Package at ${dir} has no name`)
  const slug = basename(dir)
  const name = json.name
  if (opts.filter && ![name, slug].includes(opts.filter)) return
  // oxlint-disable-next-line sort-keys
  return {
    name,
    slug,
    dir,
    root: dir === workspace,
    exports: resolveExports(json.exports ?? {}),
    publishExports: resolveExports(json.publishConfig?.exports ?? json.exports ?? {}),
    json,
    workspaceDeps: [json.dependencies, json.peerDependencies, json.optionalDependencies]
      .flatMap((deps) => Object.entries(deps ?? {}))
      .filter(([, version]) => version.startsWith("workspace:"))
      .map(([dep]) => dep),
  }
}

function sortPackages(packages: Pkg[]): Pkg[] {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  const seen = new Set<string>()
  const visiting = new Set<string>()
  const ret: Pkg[] = []

  const visit = (pkg: Pkg) => {
    if (seen.has(pkg.name)) return
    if (visiting.has(pkg.name)) throw new Error(`Circular workspace dependency: ${pkg.name}`)
    visiting.add(pkg.name)
    for (const dep of pkg.workspaceDeps) {
      const depPkg = byName.get(dep)
      if (depPkg) visit(depPkg)
    }
    visiting.delete(pkg.name)
    seen.add(pkg.name)
    ret.push(pkg)
  }

  for (const pkg of packages.toSorted((a, b) => a.name.localeCompare(b.name))) visit(pkg)
  return ret
}

/** Returns all packages in the monorepo, sorted by dependency order. */
export async function allPkgs(opts: PkgOpts = {}): Promise<Pkg[]> {
  const pkgsRoot = join(workspace, "packages")
  const dirents = await readdir(pkgsRoot, { withFileTypes: true })
  const dirs = dirents.filter((d) => d.isDirectory()).map((d) => d.name)
  if (opts.root) dirs.push(workspace)
  const pkgs = await Promise.all(
    dirs.map(async (d) => {
      try {
        return await findPkg({ ...opts, cwd: resolve(pkgsRoot, d) })
      } catch {}
    })
  )
  return sortPackages(pkgs.filter((pkg): pkg is Pkg => pkg !== undefined))
}

/** Returns the closest package, or all packages. */
export async function resolvePkgs(opts: PkgOpts = {}): Promise<Pkg[]> {
  const current = await findPkg(opts)
  return current ? [current] : await allPkgs(opts)
}
