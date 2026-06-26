import type { Globber } from "@zaly/shared/glob"
import type { Stats } from "node:fs"
import type { ConfigFile } from "../config.ts"
import type { PluginRef } from "../plugin/uri.ts"
import type { ConfigScope, ResourceFilter } from "../types.ts"

import { normPath } from "@zaly/shared"
import { globber } from "@zaly/shared/glob"
import { stat } from "node:fs/promises"
import { join } from "pathe"

export type ResourceType = (typeof RESOURCE_TYPES)[number]

export const RESOURCE_TYPES = ["plugins", "skills", "commands", "themes"] as const
const types = new Set<string>(RESOURCE_TYPES)

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
  #dir: string
  #include?: Globber
  #exclude?: Globber
  #types = new Set<ResourceType>()
  #enabled: boolean

  constructor(dir: string, opts: ResourceFilter = {}) {
    this.#dir = dir
    this.#enabled = opts.enabled ?? true
    for (const type of RESOURCE_TYPES) {
      if (!opts.exclude?.includes(type)) this.#types.add(type)
    }
    this.#include = opts.include
      ? globber(opts.include.map((t) => (types.has(t) ? `${t}/**` : t)))
      : undefined
    this.#exclude = opts.exclude ? globber(opts.exclude) : undefined
  }

  get enabled() {
    return this.#enabled
  }

  use(type: ResourceType) {
    if (!this.#enabled) return false
    return this.#types.has(type)
  }

  match(path: string) {
    if (!this.#enabled) return false
    if (!path.startsWith(this.#dir)) return false
    const rel = path.slice(this.#dir.length + 1)
    if (this.#include && !this.#include(rel)) return false
    if (this.#exclude?.(rel)) return false
    return true
  }
}

export type ResourcePackOpts = {
  config: ConfigFile
  dir: string
  plugin?: PluginRef
}

export type PluginPack = ResourcePack & { plugin: PluginRef }

export class ResourcePack extends ResourceProvider {
  #config: ConfigFile
  #dir: string
  #stat?: Stats | false
  #resources = new Map<ResourceType, string[]>()
  #matcher: ResourceMatcher
  #plugin?: PluginRef
  #disabled: Set<ResourceType>

  constructor(
    ref: string | PluginRef,
    config: ConfigFile,
    opts: { disabled?: ResourceType[] } = {}
  ) {
    super()
    this.#config = config
    this.#dir = normPath(typeof ref === "string" ? ref : ref.dir)
    this.#plugin = typeof ref === "string" ? undefined : ref
    this.#matcher = new ResourceMatcher(this.dir, this.filter)
    this.#disabled = new Set(opts.disabled)
  }

  get filter(): ResourceFilter {
    return this.#config.$.resources?.[this.id] ?? {}
  }

  async updateFilter(filter: ResourceFilter) {
    await this.#config.set(["resources", this.id], filter)
    this.#matcher = new ResourceMatcher(this.dir, this.filter)
    this.refresh()
  }

  get id() {
    if (this.#dir === this.#config.dir) return "."
    return this.#plugin?.uri ?? this.#dir
  }

  get enabled() {
    return this.#matcher.enabled
  }

  get plugin(): PluginRef | undefined {
    return this.#plugin
  }

  get scope(): ConfigScope {
    return this.#config.scope
  }

  get dir(): string {
    return this.#dir
  }

  async get(type: ResourceType) {
    let ret = this.#resources.get(type)
    if (!ret) this.#resources.set(type, (ret = await this.#get(type)))
    return ret
  }

  async all(type: ResourceType): Promise<Map<string, boolean>> {
    const all = await this.#get(type, false)
    return new Map(all.map((path) => [path, this.#matcher.match(path)]))
  }

  async #get(type: ResourceType, filter = true) {
    if (this.#disabled.has(type)) return []
    if (filter && !this.#matcher.use(type)) return []
    if (!(await this.exists())) return []
    const ret = await expand(join(this.dir, type), type)
    if (!filter) return ret
    return ret.filter((path) => this.#matcher.match(path))
  }

  async exists() {
    this.#stat ??= await stat(this.dir).catch(() => false)
    return this.#stat !== false && this.#stat.isDirectory()
  }

  refresh() {
    this.#stat = undefined
  }

  isPlugin() {
    return !!this.#plugin
  }
}
