// oxlint-disable no-await-in-loop
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "pathe"

type PackageJson = {
  name: string
  version: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  publishConfig?: Record<string, unknown> & { access?: string }
  [key: string]: unknown
}

export type PublishOptions = {
  dryRun?: boolean
  otp?: string
  packageNames?: string[]
  provenance?: boolean
  root: string
  tag?: string
}

type PackageInfo = {
  dir: string
  json: PackageJson
}

function readJson(path: string): PackageJson {
  return JSON.parse(readFileSync(path, "utf8")) as PackageJson
}

function allPackages(root: string): PackageInfo[] {
  const pkgsRoot = join(root, "packages")
  return readdirSync(pkgsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(pkgsRoot, d.name, "package.json")))
    .map((d) => {
      const dir = join(pkgsRoot, d.name)
      return { dir, json: readJson(join(dir, "package.json")) }
    })
    .filter((pkg) => !pkg.json.private && pkg.json.publishConfig !== undefined)
}

function workspaceDeps(pkg: PackageJson): string[] {
  return [pkg.dependencies, pkg.peerDependencies, pkg.optionalDependencies]
    .flatMap((deps) => Object.entries(deps ?? {}))
    .filter(([, version]) => version.startsWith("workspace:"))
    .map(([name]) => name)
}

function sortPackages(packages: PackageInfo[]): PackageInfo[] {
  const byName = new Map(packages.map((pkg) => [pkg.json.name, pkg]))
  const seen = new Set<string>()
  const visiting = new Set<string>()
  const ret: PackageInfo[] = []

  const visit = (pkg: PackageInfo) => {
    if (seen.has(pkg.json.name)) return
    if (visiting.has(pkg.json.name)) throw new Error(`Circular workspace dependency: ${pkg.json.name}`)
    visiting.add(pkg.json.name)
    for (const dep of workspaceDeps(pkg.json)) {
      const depPkg = byName.get(dep)
      if (depPkg) visit(depPkg)
    }
    visiting.delete(pkg.json.name)
    seen.add(pkg.json.name)
    ret.push(pkg)
  }

  for (const pkg of packages.toSorted((a, b) => a.json.name.localeCompare(b.json.name))) visit(pkg)
  return ret
}

async function run(cmd: string[], cwd: string): Promise<{ code: number; stdout: string }> {
  const proc = Bun.spawn(cmd, { cwd, stderr: "pipe", stdout: "pipe" })
  const [code, stdout] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code, stdout }
}

async function exec(cmd: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd, stdio: ["inherit", "inherit", "inherit"] })
  const code = await proc.exited
  if (code !== 0) process.exit(code)
}

async function withPublishManifest(pkg: PackageInfo, fn: () => Promise<void>): Promise<void> {
  const path = join(pkg.dir, "package.json")
  const original = readFileSync(path, "utf8")
  const { access: _access, ...publishConfig } = pkg.json.publishConfig ?? {}
  const patched = { ...pkg.json, ...publishConfig }
  delete patched.publishConfig

  writeFileSync(path, `${JSON.stringify(patched, undefined, 2)}\n`)
  try {
    await fn()
  } finally {
    writeFileSync(path, original)
  }
}

async function isPublished(pkg: PackageInfo): Promise<boolean> {
  const spec = `${pkg.json.name}@${pkg.json.version}`
  const { code } = await run(["npm", "view", spec, "version", "--json"], pkg.dir)
  return code === 0
}

function publishArgs(pkg: PackageInfo, opts: PublishOptions): string[] {
  const args = ["npm", "publish", "--access", pkg.json.publishConfig?.access ?? "public"]
  if (opts.dryRun) args.push("--dry-run")
  if (opts.provenance) args.push("--provenance")
  if (opts.tag) args.push("--tag", opts.tag)
  if (opts.otp) args.push("--otp", opts.otp)
  return args
}

function matches(pkg: PackageInfo, names: string[]): boolean {
  if (names.length === 0) return true
  return names.some((name) => pkg.json.name === name || pkg.json.name === `@zaly/${name}`)
}

export async function publish(opts: PublishOptions): Promise<void> {
  const selected = sortPackages(allPackages(opts.root).filter((pkg) => matches(pkg, opts.packageNames ?? [])))
  if (selected.length === 0) throw new Error("No publishable packages matched")

  for (const pkg of selected) {
    const spec = `${pkg.json.name}@${pkg.json.version}`
    if (!opts.dryRun && (await isPublished(pkg))) {
      console.log(`✓ ${spec} already published, skipping`)
      continue
    }

    console.log(`→ publishing ${spec}`)
    await withPublishManifest(pkg, () => exec(publishArgs(pkg, opts), pkg.dir))
  }
}
