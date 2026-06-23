import type { Stats } from "node:fs"
import type { PluginRef } from "../plugin/uri.ts"
import type { ConfigScope } from "../types.ts"

import { normPath } from "@zaly/shared"
import { stat } from "node:fs/promises"
import { join } from "pathe"

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
  const { glob } = await import("@zaly/shared/glob")
  const cwd = normPath(res)
  const ret = await Array.fromAsync(
    glob(globs[type], {
      cwd,
      exclude: ["node_modules", ".git", "dist", "build"],
      follow: false,
      hidden: true,
      ignore: false,
      type: "file",
    })
  )
  return ret.map((path) => join(cwd, path))
}

export abstract class ResourceProvider {
  abstract get(type: ResourceType): Promise<string[]>
  abstract refresh(): void

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

export class ResourcePack extends ResourceProvider {
  #dir: string
  #stat?: Stats | false
  #scope: ConfigScope
  #use?: Set<ResourceType>
  #resources = new Map<ResourceType, string[]>()

  constructor(opts: { dir: string; scope: ConfigScope; resources?: ResourceType[] }) {
    super()
    this.#dir = opts.dir
    this.#scope = opts.scope
    if (opts.resources) this.#use = new Set(opts.resources)
  }

  get scope(): ConfigScope {
    return this.#scope
  }

  get dir(): string {
    return this.#dir
  }

  async get(type: ResourceType) {
    let ret = this.#resources.get(type)
    if (!ret) this.#resources.set(type, (ret = await this.#get(type)))
    return ret
  }

  async #get(type: ResourceType) {
    if (this.#use && !this.#use.has(type)) return []
    if (!(await this.exists())) return []
    return await expand(join(this.dir, type), type)
  }

  async exists() {
    this.#stat ??= await stat(this.dir).catch(() => false)
    return this.#stat !== false && this.#stat.isDirectory()
  }

  refresh() {
    this.#stat = undefined
  }
}

export class PluginPack extends ResourcePack {
  #plugin: PluginRef

  constructor(opts: { plugin: PluginRef; scope: ConfigScope }) {
    super({ dir: opts.plugin.dir, scope: opts.scope })
    this.#plugin = opts.plugin
  }

  get plugin(): PluginRef {
    return this.#plugin
  }
}
