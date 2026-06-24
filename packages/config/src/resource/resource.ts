import type { Globber } from "@zaly/shared/glob"
import type { Stats } from "node:fs"
import type { PluginRef } from "../plugin/uri.ts"
import type { ConfigScope, ResourceFilter } from "../types.ts"

import { normPath } from "@zaly/shared"
import { globber } from "@zaly/shared/glob"
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

export class ResourceMatcher {
  #include?: Globber
  #exclude?: Globber
  #types = new Set<ResourceType>()
  #enabled: boolean

  constructor(opts: ResourceFilter = {}) {
    this.#enabled = opts.enabled ?? true
    for (const type of types) {
      if (!opts.exclude?.includes(type)) this.#types.add(type)
    }
    this.#include = opts.include ? globber(opts.include) : undefined
    this.#exclude = opts.exclude ? globber(opts.exclude) : undefined
  }

  use(type: ResourceType) {
    if (!this.#enabled) return false
    return this.#types.has(type)
  }

  match(path: string) {
    if (!this.#enabled) return false
    if (this.#include && !this.#include(path)) return false
    if (this.#exclude?.(path)) return false
    return true
  }
}

export class ResourcePack extends ResourceProvider {
  #dir: string
  #stat?: Stats | false
  #scope: ConfigScope
  #resources = new Map<ResourceType, string[]>()
  #matcher: ResourceMatcher

  constructor(opts: { dir: string; scope: ConfigScope; filter?: ResourceFilter }) {
    super()
    this.#dir = opts.dir
    this.#scope = opts.scope
    this.#matcher = new ResourceMatcher(opts.filter)
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
    if (!this.#matcher.use(type)) return []
    if (!(await this.exists())) return []
    const ret = await expand(join(this.dir, type), type)
    return ret.filter((path) => this.#matcher.match(path))
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
    super({ dir: opts.plugin.dir, filter: opts.plugin, scope: opts.scope })
    this.#plugin = opts.plugin
  }

  get plugin(): PluginRef {
    return this.#plugin
  }
}
