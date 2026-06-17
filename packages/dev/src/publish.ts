import type { Pkg } from "./utils.ts"

// oxlint-disable no-await-in-loop
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"

export type PublishOptions = {
  dryRun?: boolean
  otp?: string
  provenance?: boolean
  root: string
  tag?: string
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

async function pack(pkg: Pkg): Promise<{ dir: string; tarball: string }> {
  const dir = mkdtempSync(join(tmpdir(), "zaly-publish-"))
  await exec(["bunx", "--yes", "pnpm@latest", "pack", "--pack-destination", dir], pkg.dir)
  const tarballs = readdirSync(dir).filter((file) => file.endsWith(".tgz"))
  if (tarballs.length !== 1)
    throw new Error(`Expected one tarball for ${pkg.json.name}, got ${tarballs.length}`)
  return { dir, tarball: join(dir, tarballs.join("")) }
}

async function isPublished(pkg: Pkg): Promise<boolean> {
  const spec = `${pkg.json.name}@${pkg.json.version}`
  const { code } = await run(["npm", "view", spec, "version", "--json"], pkg.dir)
  return code === 0
}

function publishArgs(pkg: Pkg, opts: PublishOptions, tarball: string): string[] {
  const args = ["npm", "publish", tarball, "--access", pkg.json.publishConfig?.access ?? "public"]
  if (opts.dryRun) args.push("--dry-run")
  if (opts.provenance) args.push("--provenance")
  if (opts.tag) args.push("--tag", opts.tag)
  if (opts.otp) args.push("--otp", opts.otp)
  return args
}

export async function publish(pkgs: Pkg[], opts: PublishOptions): Promise<void> {
  if (pkgs.length === 0) throw new Error("No publishable packages matched")

  for (const pkg of pkgs) {
    if (pkg.json.private) {
      console.warn(`✗ \`${pkg.json.name}\` is private, skipping`)
      continue
    }
    const spec = `${pkg.json.name}@${pkg.json.version}`
    if (!opts.dryRun && (await isPublished(pkg))) {
      console.log(`✓ ${spec} already published, skipping`)
      continue
    }

    console.log(`→ publishing ${spec}`)
    const { dir, tarball } = await pack(pkg)
    try {
      await exec(publishArgs(pkg, opts, tarball), pkg.dir)
    } finally {
      rmSync(dir, { force: true, recursive: true })
    }
  }
}
