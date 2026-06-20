import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterEach, describe, expect, test } from "vitest"
import { allPkgs, findPkg, resolvePkgs, workspace } from "../src/utils.ts"

const dirs: string[] = []
const originalCwd = process.cwd()

function fixture(pkg: unknown, subdir = "src") {
  const dir = mkdtempSync(join(tmpdir(), "zaly-dev-utils-"))
  dirs.push(dir)
  mkdirSync(join(dir, subdir), { recursive: true })
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, undefined, 2)}\n`)
  return { cwd: join(dir, subdir), dir }
}

afterEach(() => {
  process.chdir(originalCwd)
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true })
})

describe("findPkg", () => {
  test("does not return the workspace root unless requested", async () => {
    await expect(findPkg({ cwd: workspace })).resolves.toBeUndefined()

    const root = await findPkg({ cwd: workspace, root: true })
    expect(root?.name).toBe("zaly")
    expect(root?.root).toBe(true)
  })

  test("finds the closest package from nested directories", async () => {
    const { cwd, dir } = fixture({ name: "fixture", version: "1.0.0" }, "src/nested")

    const pkg = await findPkg({ cwd })
    expect(pkg?.name).toBe("fixture")
    expect(pkg?.dir).toBe(dir)
    expect(pkg?.slug).toBe(dir.split("/").pop())
  })

  test("supports name and slug filters", async () => {
    const { cwd, dir } = fixture({ name: "@scope/fixture", version: "1.0.0" })
    const slug = dir.split("/").pop()!

    await expect(findPkg({ cwd, filter: "@scope/fixture" })).resolves.toMatchObject({
      name: "@scope/fixture",
    })
    await expect(findPkg({ cwd, filter: slug })).resolves.toMatchObject({ name: "@scope/fixture" })
    await expect(findPkg({ cwd, filter: "other" })).resolves.toBeUndefined()
  })

  test("normalizes exports and publish exports", async () => {
    const { cwd } = fixture({
      name: "fixture",
      version: "1.0.0",
      dependencies: { dep: "workspace:*", regular: "^1.0.0" },
      peerDependencies: { peer: "workspace:^" },
      optionalDependencies: { optional: "workspace:~" },
      exports: {
        ".": "./src/index.ts",
        "./feature": { bun: "./src/feature.ts", default: "./dist/feature.mjs" },
        "./fallback": ["./src/fallback.ts", "./dist/fallback.mjs"],
        "./package.json": "./package.json",
      },
      publishConfig: {
        exports: {
          ".": "./dist/index.mjs",
          "./feature": "./dist/feature.mjs",
        },
      },
    })

    const pkg = await findPkg({ cwd })
    expect(pkg?.exports).toEqual({
      ".": { default: "./src/index.ts" },
      "./fallback": { default: "./src/fallback.ts" },
      "./feature": { bun: "./src/feature.ts", default: "./dist/feature.mjs" },
    })
    expect(pkg?.publishExports).toEqual({
      ".": { default: "./dist/index.mjs" },
      "./feature": { default: "./dist/feature.mjs" },
    })
    expect(pkg?.workspaceDeps).toEqual(["dep", "peer", "optional"])
  })

  test("normalizes top-level condition maps", async () => {
    const { cwd } = fixture({
      name: "fixture",
      version: "1.0.0",
      exports: {
        import: "./dist/index.mjs",
        require: "./dist/index.cjs",
        default: "./dist/index.mjs",
      },
    })

    const pkg = await findPkg({ cwd })
    expect(pkg?.exports).toEqual({
      ".": {
        default: "./dist/index.mjs",
        import: "./dist/index.mjs",
        require: "./dist/index.cjs",
      },
    })
  })

  test("throws for unsupported nested export targets", async () => {
    const { cwd } = fixture({
      name: "fixture",
      version: "1.0.0",
      exports: {
        ".": {
          node: { import: "./dist/index.mjs" },
        },
      },
    })

    await expect(findPkg({ cwd })).rejects.toThrow('Unsupported export target for "." export')
  })
})

describe("package resolution", () => {
  test("allPkgs excludes the root package by default", async () => {
    const all = await allPkgs()
    const names = all.map((pkg) => pkg.name)
    expect(names).toContain("@zaly/shared")
    expect(names).not.toContain("zaly")
  })

  test("allPkgs can include the root package", async () => {
    const all = await allPkgs({ root: true })
    const names = all.map((pkg) => pkg.name)
    expect(names).toContain("zaly")
  })

  test("resolvePkgs returns all packages from the workspace root", async () => {
    process.chdir(workspace)
    const pkgs = await resolvePkgs()
    const names = pkgs.map((pkg) => pkg.name)
    expect(names).toContain("@zaly/shared")
    expect(names).not.toContain("zaly")
  })

  test("resolvePkgs returns only the closest workspace package", async () => {
    process.chdir(join(workspace, "packages", "shared", "src"))
    const pkgs = await resolvePkgs()
    expect(pkgs.map((pkg) => pkg.name)).toEqual(["@zaly/shared"])
  })
})
