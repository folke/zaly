import type { Stats } from "node:fs"
import type { Config, LoadedSettings } from "../types.ts"

import { normPath } from "@zaly/shared"
import { isRemotePath, zalyPaths } from "@zaly/shared/paths"
import { stat } from "node:fs/promises"
import { join } from "pathe"

export type ResourceType = (typeof types)[number]

const types = ["plugins", "skills", "prompts", "themes"] as const

const globs = {
  plugins: ["*.{ts,js}", "*/index.{ts,js}"],
  prompts: "*.md",
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

  async prompts() {
    return this.get("prompts")
  }

  async skills() {
    return this.get("skills")
  }

  async plugins() {
    return this.get("plugins")
  }
}

export class ResourcePaths extends ResourceProvider {
  #paths: NonNullable<Config["settings"]["resources"]>
  #packs = new Map<string, ResourcePack>()
  #dir: string

  constructor(opts: LoadedSettings) {
    super()
    this.#dir = normPath(opts.dir)
    this.#paths = opts.settings?.resources ?? {}
    for (const p of this.#paths.packs ?? []) {
      const dir = isRemotePath(p) ? zalyPaths.pluginPath(p) : normPath(this.#dir, p)
      this.#packs.set(p, new ResourcePack({ dir, source: p }))
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
  #source?: string
  #stat?: Stats | false

  constructor(opts: { dir: string; source?: string }) {
    super()
    this.#dir = opts.dir
    this.#source = opts.source
  }

  get source() {
    return this.#source
  }

  get dir() {
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
