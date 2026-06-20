import type { Stats } from "node:fs"
import type { PackPath } from "../pack/uri.ts"
import type { LoadedSettings } from "../types.ts"

import { normPath } from "@zaly/shared"
import { stat } from "node:fs/promises"
import { join } from "pathe"
import { packPath } from "../pack/uri.ts"

export type ResourceType = (typeof types)[number]

const types = ["plugins", "skills", "commands", "themes"] as const

const globs = {
  commands: "*.md",
  plugins: ["*.{ts,js}", "*/index.{ts,js}"],
  skills: "**/SKILL.md",
  themes: "*.json",
} as const satisfies Record<ResourceType, string | string[]>

async function expand(res: string, type: ResourceType) {
  const s = await stat(res).catch(() => undefined)
  if (!s) return []
  if (!s.isDirectory()) return [res]
  const { glob: _glob } = await import("@zaly/shared/glob")
  const cwd = normPath(res)
  const ret = await Array.fromAsync(
    _glob(globs[type], {
      cwd,
      exclude: ["node_modules", ".git", "dist", "build"],
      follow: true,
      hidden: true,
      ignore: false,
      type: "file",
    })
  )
  return ret.map((path) => join(cwd, path))
}

export abstract class ResourceProvider {
  #resources = new Map<ResourceType, string[]>()

  protected abstract _get(type: ResourceType): Promise<string[] | undefined>

  async get(type: ResourceType) {
    let ret = this.#resources.get(type)
    if (!ret) this.#resources.set(type, (ret = (await this._get(type)) ?? []))
    return ret
  }

  refresh() {
    this.#resources.clear()
  }

  async themes() {
    return this.get("themes")
  }

  async commands() {
    return this.get("commands")
  }

  async skills() {
    return this.get("skills")
  }

  async plugins() {
    return this.get("plugins")
  }
}

export class ResourcePaths extends ResourceProvider {
  #paths: Partial<Record<ResourceType, string[]>> = {}
  #packs = new Map<string, ResourcePack>()
  #dir: string

  constructor(opts: LoadedSettings) {
    super()
    this.#dir = normPath(opts.dir)
    const res = opts.settings?.resources ?? {}
    const resolve = (t: ResourceType | "packs") => (Array.isArray(res[t]) ? res[t] : [])
    for (const type of types) this.#paths[type] = resolve(type)
    for (const uri of resolve("packs")) {
      const info = packPath(uri, { cwd: this.#dir, data: opts.paths.data })
      this.#packs.set(uri, new ResourcePack({ dir: info.dir, info }))
    }
  }

  get packs() {
    return this.#packs
  }

  get dir() {
    return this.#dir
  }

  async _get(type: ResourceType) {
    const paths = this.#paths[type] ?? []
    if (!paths.length) return []
    const ret = await Promise.all(paths.map((path) => expand(normPath(this.#dir, path), type)))
    return ret.flat()
  }

  override refresh() {
    super.refresh()
    this.#packs.forEach((pkg) => pkg.refresh())
  }
}

export class ResourcePack extends ResourceProvider {
  #dir: string
  #info?: PackPath
  #stat?: Stats | false

  constructor(opts: { dir: string; info?: PackPath }) {
    super()
    this.#dir = opts.dir
    this.#info = opts.info
  }

  get info(): PackPath | undefined {
    return this.#info
  }

  get dir(): string {
    return this.#dir
  }

  async _get(type: ResourceType) {
    if (!(await this.exists())) return []
    return await expand(join(this.dir, type), type)
  }

  async exists() {
    this.#stat ??= await stat(this.dir).catch(() => false)
    return this.#stat !== false && this.#stat.isDirectory()
  }

  override refresh() {
    super.refresh()
    this.#stat = undefined
  }
}
