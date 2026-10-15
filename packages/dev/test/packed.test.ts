import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test } from "vitest"
import { packedTarballs, verificationPlan } from "./helpers/packed.ts"

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true })
})

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "zaly-packed-plan-"))
  dirs.push(dir)
  mkdirSync(join(dir, "packages"))
  const path = join(dir, "packages/cli.tgz")
  writeFileSync(path, "tarball bytes")
  const entry = {
    kind: "publish",
    name: "@zaly/cli",
    version: "1.0.0",
    tarball: {
      path: "packages/cli.tgz",
      integrity: `sha256-${createHash("sha256").update(readFileSync(path)).digest("base64")}`,
    },
  }
  const plan = { version: 1, plan: [[entry]] }
  const save = () => writeFileSync(join(dir, "publish-plan.json"), JSON.stringify(plan))
  save()
  return { dir, path, entry, plan, save }
}

test("smoke tests use the exact Changesets tarballs and ignore tag-only entries", () => {
  const { dir, path, entry, plan, save } = fixture()
  plan.plan[0].push({ ...entry, kind: "tag-only", name: "private" })
  save()
  expect(packedTarballs(dir)).toEqual([path])
})

test("smoke tests reject corrupt tarballs", () => {
  const { dir, path } = fixture()
  writeFileSync(path, "changed bytes")
  expect(() => packedTarballs(dir)).toThrow("Tarball integrity mismatch")
})

test("smoke tests reject escaping paths, duplicates, empty and unsupported plans", () => {
  const { dir, entry, plan, save } = fixture()
  entry.tarball.path = "../cli.tgz"
  save()
  expect(() => packedTarballs(dir)).toThrow("Invalid tarball path")
  entry.tarball.path = "packages/cli.tgz"
  plan.plan[0].push(entry)
  save()
  expect(() => packedTarballs(dir)).toThrow("Duplicate packages")
  plan.plan = []
  save()
  expect(() => packedTarballs(dir)).toThrow("No packages")
  plan.version = 2
  save()
  expect(() => packedTarballs(dir)).toThrow("Unsupported Changesets publish plan")
})

test("offline verification includes every public package without requiring registry queries", async () => {
  const { dir } = fixture()
  const path = join(dir, "verify.json")
  await verificationPlan(path)
  const plan = JSON.parse(readFileSync(path, "utf8")) as {
    version: number
    plan: { kind: string; name: string; version: string }[][]
  }
  expect(plan.version).toBe(1)
  expect(plan.plan.flat()).toHaveLength(7)
  expect(plan.plan.flat().every((pkg) => pkg.kind === "publish" && pkg.version)).toBe(true)
  expect(plan.plan.flat().some((pkg) => pkg.name === "@zaly/dev")).toBe(false)
})
