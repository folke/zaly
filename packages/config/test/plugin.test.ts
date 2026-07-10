import type { PluginRef } from "../src/plugin/uri.ts"

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Git } from "../src/plugin/git.ts"
import { Plugin, PluginManager, PluginStore } from "../src/plugin/manager.ts"
import { Npm } from "../src/plugin/npm.ts"
import { pluginRef, pluginUri } from "../src/plugin/uri.ts"

let dirs: string[] = []
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { force: true, recursive: true })
  dirs = []
  vi.restoreAllMocks()
})

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), "zaly-config-plugin-"))
  dirs.push(dir)
  return dir
}

class FakePlugin extends Plugin<"dir"> {
  constructor(
    source: PluginRef<"dir">,
    public state = { installed: false, updates: false }
  ) {
    super(source, { git: ["git"], npm: ["npm"] })
  }

  async installed(): Promise<boolean> {
    return this.state.installed
  }

  async install(): Promise<void> {
    this.state.installed = true
  }

  async update(): Promise<boolean> {
    const ret = this.state.updates
    this.state.updates = false
    return ret
  }

  async hasUpdate(): Promise<boolean> {
    return this.state.updates
  }
}

describe("pluginUri and pluginRef", () => {
  test("parses empty refs and builds scoped store dirs", () => {
    expect(pluginUri("npm:pkg@")).toEqual({ name: "pkg@", type: "npm", version: undefined })

    const data = join(tmp(), "data")
    expect(pluginRef("./local", { cwd: "/repo", data, scope: "project" })).toMatchObject({
      dir: "/repo/local",
      path: "./local",
      scope: "project",
      store: join(data, "packs/dir"),
      type: "dir",
      uri: "./local",
    })
    expect(
      pluginRef("git:https://github.com/a/b", { cwd: "/repo", data, scope: "user" })
    ).toMatchObject({
      dir: expect.stringContaining(join(data, "packs/git")),
      repo: "git:https://github.com/a/b",
      scope: "user",
      store: join(data, "packs/git"),
      type: "git",
    })
    expect(pluginRef("npm:@scope/pkg@1.2.3", { cwd: "/repo", data, scope: "user" })).toMatchObject({
      dir: join(data, "packs/npm/node_modules/@scope/pkg"),
      name: "@scope/pkg",
      store: join(data, "packs/npm"),
      type: "npm",
      version: "1.2.3",
    })
  })
})

describe("PluginManager, Plugin, and PluginStore", () => {
  test("creates and caches git/npm plugin instances", async () => {
    const data = join(tmp(), "data")
    const refs = [
      pluginRef("git:https://github.com/example/repo", { cwd: "/repo", data, scope: "user" }),
      pluginRef("npm:@scope/pkg@1.0.0", { cwd: "/repo", data, scope: "user" }),
    ]
    const manager = new PluginManager(refs, { git: ["git"], npm: ["npm"] })

    const packs = await manager.packs()
    expect(packs.map((pack) => pack.source.type)).toEqual(["git", "npm"])
    await expect(manager.packs()).resolves.toBe(packs)
  })

  test("reports missing local git/npm plugins without shelling out", async () => {
    const data = join(tmp(), "data")
    const manager = new PluginManager([
      pluginRef("git:https://github.com/example/repo", { cwd: "/repo", data, scope: "user" }),
      pluginRef("npm:missing", { cwd: "/repo", data, scope: "user" }),
    ])

    const missing = await manager.missing()
    expect(missing.map((pack) => pack.source.type)).toEqual(["git", "npm"])
  })

  test("install/update no-op when there are no plugins", async () => {
    const manager = new PluginManager([])
    await expect(manager.install()).resolves.toBeUndefined()
    await expect(manager.update()).resolves.toBeUndefined()
  })

  test("install rejects unsupported plugin types", async () => {
    const manager = new PluginManager([])
    const plugin = new FakePlugin({
      dir: "/pack",
      path: "/pack",
      scope: "user",
      store: "/store",
      type: "dir",
      uri: "/pack",
    })
    await expect(manager.install([plugin])).rejects.toThrow("Unsupported pack type")
  })

  test("reports info and narrows by source type", async () => {
    const plugin = new FakePlugin(
      { dir: "/pack", path: "/pack", scope: "user", store: "/store", type: "dir", uri: "/pack" },
      { installed: true, updates: true }
    )

    expect(plugin.is("dir")).toBe(true)
    expect(plugin.is("git" as never)).toBe(false)
    await expect(plugin.info()).resolves.toEqual({ hasUpdate: true, installed: true })
  })

  test("store installs and updates plugins in parallel", async () => {
    const a = new FakePlugin({
      dir: "/a",
      path: "/a",
      scope: "user",
      store: "/store",
      type: "dir",
      uri: "/a",
    })
    const b = new FakePlugin(
      { dir: "/b", path: "/b", scope: "user", store: "/store", type: "dir", uri: "/b" },
      { installed: false, updates: true }
    )
    const store = new PluginStore("/store", { git: ["git"], npm: ["npm"] })

    await store.install([a, b])
    expect(await a.installed()).toBe(true)
    expect(await b.installed()).toBe(true)
    await store.update([a, b])
    expect(await b.hasUpdate()).toBe(false)
  })
})

describe("Git", () => {
  test("checks repo existence and clone sentinel", async () => {
    const dir = tmp()
    const git = new Git(join(dir, "repo"))
    await expect(git.exists()).resolves.toBe(false)

    mkdirSync(join(dir, "repo/.git"), { recursive: true })
    await expect(git.exists()).resolves.toBe(true)

    writeFileSync(git.sentinel, "")
    await expect(git.exists()).resolves.toBe(false)
  })

  test("remote caches values and fetch clears the cache", async () => {
    const git = new Git(tmp())
    const run = vi.spyOn(git, "run").mockResolvedValue("abc\trefs/heads/main")

    await expect(git.remote("HEAD")).resolves.toBe("abc")
    await expect(git.remote("HEAD")).resolves.toBe("abc")
    expect(run).toHaveBeenCalledTimes(1)

    await git.fetch("main")
    await git.remote("HEAD")
    expect(run).toHaveBeenCalledTimes(3)
  })

  test("wraps git clone, checkout, ref, and head commands", async () => {
    const dir = join(tmp(), "repo")
    const git = new Git(dir)
    const run = vi.spyOn(git, "run").mockResolvedValue("abc")

    await expect(git.clone("https://example.com/repo.git")).resolves.toBe("abc")
    expect(run).toHaveBeenCalledWith(
      "clone",
      "--filter=blob:none",
      "--origin=origin",
      "-c",
      "core.autocrlf=false",
      "--tags",
      "--",
      "https://example.com/repo.git",
      dir,
      { cwd: undefined }
    )

    await expect(git.checkout("main")).resolves.toBe("abc")
    expect(run).toHaveBeenCalledWith("checkout", "--force", "main")
    await expect(git.ref("main")).resolves.toBe("abc")
    expect(run).toHaveBeenCalledWith("rev-parse", "main^{commit}", { throw: false })
    await expect(git.head()).resolves.toBe("abc")
    expect(run).toHaveBeenCalledWith("rev-parse", "HEAD^{commit}", { throw: false })
  })
})

describe("Npm", () => {
  test("install chooses --cwd for bun and --prefix for other package managers", async () => {
    const bun = new Npm("/store", ["bun"])
    const bunRun = vi.spyOn(bun, "run").mockResolvedValue(undefined)
    await bun.install(["a", "b"])
    expect(bunRun).toHaveBeenCalledWith("install", "--cwd", "/store", "a", "b", { cwd: undefined })

    const npm = new Npm("/store", ["npm"])
    const npmRun = vi.spyOn(npm, "run").mockResolvedValue(undefined)
    await npm.install("pkg")
    expect(npmRun).toHaveBeenCalledWith("install", "--prefix", "/store", "pkg", { cwd: undefined })
  })

  test("detects package managers from command names", () => {
    expect(new Npm("/tmp", ["bun"]).pm).toBe("bun")
    expect(new Npm("/tmp", ["pnpm.exe"]).pm).toBe("pnpm")
    expect(() => new Npm("/tmp", ["node"]).pm).toThrow("Unknown package manager")
  })

  test("reads installed package versions and handles missing packages", async () => {
    const dir = tmp()
    mkdirSync(join(dir, "node_modules/pkg"), { recursive: true })
    writeFileSync(join(dir, "node_modules/pkg/package.json"), JSON.stringify({ version: "1.2.3" }))
    const npm = new Npm(dir)

    await expect(npm.version("pkg")).resolves.toBe("1.2.3")
    await expect(npm.version("missing")).resolves.toBeUndefined()
  })

  test("parses latest versions from package manager output", async () => {
    const npm = new Npm(tmp())
    const run = vi.spyOn(npm, "run")
    run.mockResolvedValueOnce(JSON.stringify("1.2.3"))
    await expect(npm.latest("pkg")).resolves.toBe("1.2.3")

    run.mockResolvedValueOnce(JSON.stringify(["1.0.0", "1.10.0", "1.2.0"]))
    await expect(npm.latest("pkg")).resolves.toBe("1.10.0")

    run.mockResolvedValueOnce(JSON.stringify([1, false]))
    await expect(npm.latest("pkg")).resolves.toBeUndefined()

    run.mockResolvedValueOnce(undefined)
    await expect(npm.latest("pkg")).resolves.toBeUndefined()
  })
})
