import type { LoadConfigOpts } from "../config.ts"
import type { Config, LoadedSettings, SettingsScope } from "../types.ts"
import type { ResourceType } from "./resource.ts"

import { ResourcePack, ResourcePaths, ResourceProvider } from "./resource.ts"

/** Resources are sorted from highest to lowest precedence. */
export class ResourceManager extends ResourceProvider {
  #providers: (ResourcePaths | ResourcePack)[] = []
  #opts: LoadConfigOpts

  constructor(config: Omit<Config, "resources">, opts?: LoadConfigOpts) {
    super()
    this.#opts = opts ?? {}

    // Project resources have the highest precedence
    this.#add({ dotAgents: config.paths.dotAgents, ...config.project })

    // Workspace resources have the next highest precedence
    if (config.workspace) this.#add(config.workspace)

    // User resources have the lowest precedence
    this.#add({ dotAgents: ["~/.agents"], ...config.user })
  }

  #add(opts: LoadedSettings & { dotAgents?: string[] }) {
    const res = opts.settings?.resources ? new ResourcePaths(opts) : undefined

    // Add settings.resources paths first
    if (res) this.add(res)

    // Add any file resources from this directory
    this.add(new ResourcePack(opts))

    // Add any packs from settings.resources.packs
    if (res) this.add(...res.packs.values())

    // Add any skills from dotAgents paths
    for (const dir of opts.dotAgents ?? [])
      this.add(new ResourcePaths({ ...opts, dir, settings: { resources: { skills: ["skills"] } } }))
  }

  add(...res: (ResourcePaths | ResourcePack)[]) {
    this.#providers.push(...res)
    this.refresh()
  }

  override async get(type: ResourceType, scope?: SettingsScope) {
    return scope ? this._get(type, scope) : super.get(type)
  }

  packs(scope?: SettingsScope): ResourcePack[] {
    const ret: ResourcePack[] = []
    for (const res of this.#providers) {
      if (scope && res.scope !== scope) continue
      if (res instanceof ResourcePaths) ret.push(...res.packs.values())
    }
    return ret
  }

  async _get(type: ResourceType, scope?: SettingsScope): Promise<string[]> {
    if (this.#opts.settings?.resources?.[type] === false) return []
    const ret = await Promise.all(
      this.#providers.map(async (res) =>
        scope === undefined || res.scope === scope ? res[type]() : []
      )
    )
    return ret.flat()
  }

  override refresh() {
    super.refresh()
    this.#providers.forEach((res) => res.refresh())
  }
}
