import type { ConfigFile, ConfigManager, ConfigManagerOpts } from "../config.ts"
import type { ConfigScope } from "../types.ts"
import type { ResourceType } from "./resource.ts"

import { pluginRef } from "../plugin/uri.ts"
import { PluginPack, ResourcePack, ResourceProvider } from "./resource.ts"

export type ResourceFilter = { scope?: ConfigScope; plugin?: boolean }

/** Resources are sorted from highest to lowest precedence. */
export class ResourceManager extends ResourceProvider {
  #packs: ResourcePack[] = []
  #opts: ConfigManagerOpts
  #disabled: Set<ResourceType>

  constructor(config: ConfigManager, opts?: ConfigManagerOpts) {
    super()
    this.#opts = opts ?? {}
    this.#disabled = new Set(this.#opts.disabled)

    // Project resources have the highest precedence
    this.#add(config.project, config.paths.dotAgents)

    // Workspace resources have the next highest precedence
    if (config.workspace) this.#add(config.workspace)

    // User resources have the lowest precedence
    this.#add(config.user, ["~/.agents"])
  }

  #add(opts: ConfigFile, dotAgents?: string[]) {
    // Add any file resources from this directory
    this.#packs.push(new ResourcePack(opts))

    // Add any packs from settings.resources.packs
    for (const spec of opts.$?.plugins ?? []) {
      const uri = typeof spec === "string" ? spec : spec.uri
      const plugin = pluginRef(uri, { cwd: opts.dir, data: opts.paths.data })
      const pack = new PluginPack({ plugin, scope: opts.scope })
      this.#packs.push(pack)
    }

    // Add any skills from dotAgents paths
    for (const dir of dotAgents ?? [])
      this.#packs.push(new ResourcePack({ dir, resources: ["skills"], scope: opts.scope }))
    this.refresh()
  }

  list(filter?: { plugin: true; scope?: ConfigScope }): PluginPack[]
  list(filter?: ResourceFilter): ResourcePack[]
  list(filter?: ResourceFilter): ResourcePack[] {
    return this.#packs.filter((res) => {
      if (!filter) return true
      if (filter.scope && res.scope !== filter.scope) return false
      if (filter.plugin !== undefined) {
        const isPlugin = res instanceof PluginPack
        if (isPlugin !== filter.plugin) return false
      }
      return true
    })
  }

  async get(type: ResourceType, scope?: ConfigScope): Promise<string[]> {
    if (this.#disabled.has(type)) return []
    const ret = await Promise.all(this.list({ scope }).map(async (res) => res.get(type)))
    return ret.flat()
  }

  override refresh() {
    this.#packs.forEach((res) => res.refresh())
  }
}
