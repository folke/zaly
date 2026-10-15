import { getReleasePlan } from "@changesets/get-release-plan"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterEach, expect, test } from "vitest"
import { allPkgs, workspace } from "../src/utils.ts"

const config = JSON.parse(readFileSync(join(workspace, ".changeset/config.json"), "utf8")) as {
  linked: string[][]
  fixed: string[][]
  privatePackages: { version: boolean; tag: boolean }
}
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function fixture(changes: Record<string, "patch" | "minor">, highest = "1.0.0") {
  const dir = mkdtempSync(join(tmpdir(), "zaly-release-plan-"))
  dirs.push(dir)
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "zaly", private: true }))
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n")
  const packages = await allPkgs()
  for (const pkg of packages.filter((candidate) => !candidate.json.private)) {
    const path = join(dir, "packages", pkg.name.split("/").at(-1)!)
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, "package.json"), JSON.stringify({ ...pkg.json, version: "1.0.0" }))
  }
  const cli = join(dir, "packages/cli/package.json")
  writeFileSync(cli, JSON.stringify({ ...JSON.parse(readFileSync(cli, "utf8")), version: highest }))
  mkdirSync(join(dir, ".changeset"))
  writeFileSync(join(dir, ".changeset/config.json"), JSON.stringify(config))
  writeFileSync(
    join(dir, ".changeset/test.md"),
    `---\n${Object.entries(changes)
      .map(([name, type]) => `"${name}": ${type}`)
      .join("\n")}\n---\n\nRelease note.\n`
  )
  return getReleasePlan(dir)
}

test("one linked group contains exactly the public packages", async () => {
  const packages = await allPkgs()
  const names = packages
    .filter((pkg) => !pkg.json.private)
    .map((pkg) => pkg.name)
    .toSorted()
  expect(names).toHaveLength(7)
  expect(config.linked).toHaveLength(1)
  expect(config.linked[0].toSorted()).toEqual(names)
  expect(config.fixed).toEqual([])
  expect(config.privatePackages).toEqual({ version: false, tag: false })
})

test("CLI depends on every public library at its exact workspace version", async () => {
  const all = await allPkgs()
  const packages = all.filter((pkg) => !pkg.json.private)
  const cli = packages.find((pkg) => pkg.name === "@zaly/cli")!
  for (const pkg of packages) {
    if (pkg !== cli) expect(cli.json.dependencies?.[pkg.name]).toBe("workspace:*")
  }
})

test.each([
  ["agent", ["agent", "cli", "config", "plugin"]],
  ["tui", ["cli", "config", "plugin", "tui"]],
  ["cli", ["cli"]],
  ["shared", ["agent", "ai", "cli", "config", "plugin", "shared", "tui"]],
] as const)(
  "%s patch releases only the package and affected dependents",
  async (name, expected) => {
    const plan = await fixture({ [`@zaly/${name}`]: "patch" })
    const releases = plan.releases.filter((release) => release.type !== "none")
    expect(releases.map((release) => release.name).toSorted()).toEqual(
      expected.map((value) => `@zaly/${value}`)
    )
    expect(releases.every((release) => release.newVersion === "1.0.1")).toBe(true)
  }
)

test("a library catches up to CLI's highest version without bumping unrelated libraries", async () => {
  const plan = await fixture({ "@zaly/agent": "patch" }, "1.2.0")
  const releases = plan.releases.filter((release) => release.type !== "none")
  expect(releases.map((release) => release.name).toSorted()).toEqual([
    "@zaly/agent",
    "@zaly/cli",
    "@zaly/config",
    "@zaly/plugin",
  ])
  expect(releases.every((release) => release.newVersion === "1.2.1")).toBe(true)
  expect(releases.find((release) => release.name === "@zaly/cli")?.changesets).toEqual([])
})

test("explicitly naming CLI gives it the authored release note", async () => {
  const plan = await fixture({ "@zaly/agent": "patch", "@zaly/cli": "patch" })
  expect(plan.releases.find((release) => release.name === "@zaly/cli")?.changesets).toEqual([
    "test",
  ])
})

test("the highest requested bump applies to all participating linked packages", async () => {
  const plan = await fixture({ "@zaly/agent": "minor", "@zaly/tui": "patch" })
  const releases = plan.releases.filter((release) => release.type !== "none")
  expect(releases).toHaveLength(5)
  expect(releases.every((release) => release.newVersion === "1.1.0")).toBe(true)
})
