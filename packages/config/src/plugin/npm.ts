import type { SpawnOpts } from "@zaly/shared/process"
import type { PluginManagerOpts } from "./manager.ts"
import type { PluginRef } from "./uri.ts"

import { spawnCmd } from "@zaly/shared/process"
import { readFile } from "node:fs/promises"
import { join } from "pathe"
import { Plugin, PluginStore } from "./manager.ts"

export type NpmOpts = SpawnOpts & {
  cwd?: string
  throw?: boolean
}

type NpmArgs = (string | undefined)[] | [...(string | undefined)[], NpmOpts]
export type PackageManager = "npm" | "yarn" | "pnpm" | "bun"
const pms = new Set(["npm", "yarn", "pnpm", "bun"])

export class Npm {
  constructor(
    public dir: string,
    public cmd = ["npm"]
  ) {}

  get pm(): PackageManager {
    const cmd = this.cmd.map((c) => c.toLowerCase().replace(/\.(cmd|exe)$/, ""))
    for (const c of cmd) {
      if (pms.has(c)) return c as PackageManager
    }
    throw new Error(`Unknown package manager in command: ${this.cmd.join(" ")}`)
  }

  async run(...cmd: NpmArgs): Promise<string | undefined> {
    return spawnCmd(...this.cmd, { cwd: this.dir }, ...cmd)
  }

  async install(pkg: string | string[]) {
    const pkgs = Array.isArray(pkg) ? pkg : [pkg]
    await this.run("install", this.pm === "bun" ? "--cwd" : "--prefix", this.dir, ...pkgs, {
      cwd: undefined,
    })
  }

  async version(name: string): Promise<string | undefined> {
    try {
      const pkg = JSON.parse(
        await readFile(join(this.dir, "node_modules", name, "package.json"), "utf8")
      )
      return pkg.version
    } catch {
      return undefined
    }
  }

  async latest(spec: string): Promise<string | undefined> {
    try {
      const v = await this.run(
        this.pm === "bun" ? "pm" : undefined,
        "view",
        spec,
        "version",
        "--json",
        { throw: false }
      )
      if (!v) return undefined
      const json = JSON.parse(v)
      const versions = (Array.isArray(json) ? json : [json]).filter((x) => typeof x === "string")
      if (versions.length === 0) return undefined
      if (versions.length === 1) return versions[0]
      let cmp: (a: string, b: string) => number
      if (process.versions.bun) cmp = Bun.semver.order
      else {
        const { compare } = await import("semver")
        cmp = compare
      }
      versions.sort(cmp)
      return versions.at(-1)
    } catch {
      return undefined
    }
  }
}

export class NpmPlugin extends Plugin<"npm"> {
  #npm: Npm

  constructor(source: PluginRef<"npm">, opts: PluginManagerOpts) {
    super(source, opts)
    this.#npm = new Npm(source.store, opts.npm)
  }

  get spec(): string {
    return `${this.source.name}@${this.source.version ?? "latest"}`
  }

  async #latest(): Promise<string | undefined> {
    return await this.#npm.latest(this.spec)
  }

  async #version(): Promise<string | undefined> {
    return await this.#npm.version(this.source.name)
  }

  async install() {
    await this.#npm.install(this.spec)
  }

  async installed(): Promise<boolean> {
    const v = await this.#version()
    return v !== undefined
  }

  async hasUpdate(): Promise<boolean> {
    const v = await this.#version()
    if (!v) return true
    const latest = await this.#latest()
    return latest !== v
  }

  async update(): Promise<boolean> {
    await this.install()
    return true
  }

  override async info() {
    return {
      ...(await super.info()),
      latest: await this.#latest(),
      version: await this.#version(),
    }
  }
}

export class NpmStore extends PluginStore<"npm"> {
  #npm: Npm

  constructor(store: string, opts: PluginManagerOpts) {
    super(store, opts)
    this.#npm = new Npm(store, opts.npm)
  }

  override async install(packs: Plugin<"npm">[]): Promise<void> {
    await this.#npm.install(packs.map((p) => (p as NpmPlugin).spec))
  }

  override async update(packs: Plugin<"npm">[]): Promise<void> {
    await this.install(packs)
  }
}
