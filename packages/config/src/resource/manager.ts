import type { ConfigFile, ConfigManager, ConfigManagerOpts } from "../config.ts"
import type { ConfigScope } from "../types.ts"
import type { PluginPack, ResourceType } from "./resource.ts"

import { pluginRef } from "../plugin/uri.ts"
import { RESOURCE_TYPES, ResourcePack, ResourceProvider } from "./resource.ts"

export type ResourcePackFilter = { scope?: ConfigScope; plugin?: boolean }

/** Resources are sorted from highest to lowest precedence. */
export class ResourceManager extends ResourceProvider {
  #packs: ResourcePack[] = []
  #disabled: Set<ResourceType>

  constructor(config: ConfigManager, opts?: ConfigManagerOpts) {
    super()
    this.#disabled = new Set(opts?.disabled)

    // Project resources have the highest precedence
    this.#add(config.project, config.paths.dotAgents)

    // Workspace resources have the next highest precedence
    if (config.workspace) this.#add(config.workspace)

    // User resources have the lowest precedence
    this.#add(config.user, ["~/.agents"])
  }

  #add(config: ConfigFile, dotAgents?: string[]) {
    // Add any file resources from this directory
    this.#packs.push(new ResourcePack(config.dir, config))

    // Add any packs from settings.resources.packs
    for (const uri of config.$?.plugins ?? []) {
      const plugin = pluginRef(uri, { cwd: config.dir, data: config.paths.data })
      const pack = new ResourcePack(plugin, config)
      this.#packs.push(pack)
    }

    // Add any skills from dotAgents paths
    if (!this.#disabled.has("skills")) {
      for (const dir of dotAgents ?? []) {
        this.#packs.push(
          new ResourcePack(dir, config, {
            disabled: RESOURCE_TYPES.filter((t) => t !== "skills"),
          })
        )
      }
    }
    this.refresh()
  }

  list(filter: { plugin: true; scope?: ConfigScope }): PluginPack[]
  list(filter?: ResourcePackFilter): ResourcePack[]
  list(filter?: ResourcePackFilter): ResourcePack[] {
    return this.#packs.filter((res) => {
      if (!filter) return true
      if (filter.scope && res.scope !== filter.scope) return false
      if (filter.plugin !== undefined && res.isPlugin() !== filter.plugin) return false
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
