import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { allPkgs } from "../../src/utils.ts"

const exec = promisify(execFile)

type PackedPackage = {
  kind: string
  name: string
  version: string
  tarball?: { path: string; integrity: string }
}

export function packedTarballs(dir: string): string[] {
  dir = resolve(dir)
  const manifest = JSON.parse(readFileSync(join(dir, "publish-plan.json"), "utf8")) as {
    version: number
    plan: PackedPackage[][]
  }
  assert.equal(manifest.version, 1, "Unsupported Changesets publish plan")
  const packages = manifest.plan.flat().filter((pkg) => pkg.kind === "publish")
  assert(packages.length > 0, "No packages to smoke-test")
  assert.equal(new Set(packages.map((pkg) => pkg.name)).size, packages.length, "Duplicate packages")
  return packages.map((pkg) => {
    assert(pkg.tarball, `Missing tarball for ${pkg.name}`)
    const path = resolve(dir, pkg.tarball.path)
    assert(path.startsWith(dir + sep) && path.endsWith(".tgz"), "Invalid tarball path")
    const integrity = `sha256-${createHash("sha256").update(readFileSync(path)).digest("base64")}`
    assert.equal(integrity, pkg.tarball.integrity, `Tarball integrity mismatch: ${pkg.name}`)
    return path
  })
}

/** Offline plan for PR verification, including packages whose versions are already published. */
export async function verificationPlan(path: string): Promise<void> {
  const all = await allPkgs()
  const packages = all.filter((pkg) => !pkg.json.private)
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        version: 1,
        plan: [
          packages.map((pkg) => ({
            kind: "publish",
            name: pkg.name,
            version: pkg.json.version,
            access: "public",
            tag: "latest",
          })),
        ],
      },
      undefined,
      2
    )}\n`
  )
}

export async function installedRelease(dir: string): Promise<{ cwd: string; dispose: () => void }> {
  const tarballs = packedTarballs(dir)
  const cwd = mkdtempSync(join(tmpdir(), "zaly-installed-test-"))
  const dispose = () => rmSync(cwd, { recursive: true, force: true })
  try {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({ name: "zaly-packed-test", private: true, type: "module" })
    )
    await exec("npm", ["install", "--no-audit", "--no-fund", ...tarballs], { cwd })
    copyFileSync(
      fileURLToPath(new URL("../fixtures/packed-smoke.mjs", import.meta.url)),
      join(cwd, "smoke.mjs")
    )
    return { cwd, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}
