import type { LoadConfigOpts } from "../config.ts"
import type { Config, LoadedSettings } from "../types.ts"
import type { ResourceType } from "./resource.ts"

import { ResourcePack, ResourcePaths, ResourceProvider } from "./resource.ts"

/** Resources are sorted from highest to lowest precedence. */
export class ResourceManager extends ResourceProvider {
  #providers: ResourceProvider[] = []
  #opts: LoadConfigOpts

  constructor(config: Omit<Config, "resources">, opts?: LoadConfigOpts) {
    super()
    this.#opts = opts ?? {}
    if (config.project.settings)
      this.#add({
        dotAgents: config.paths.dotAgents,
        ...config.project,
      })
    if (config.workspace?.settings) this.#add(config.workspace)
    this.#add({ dotAgents: ["~/.agents"], ...config.user })
  }

  #add(opts: LoadedSettings & { dotAgents?: string[] }) {
    const res = new ResourcePaths(opts)
    this.add(
      res,
      new ResourcePack(opts),
      ...res.packs.values(),
      ...(opts.dotAgents ?? []).map(
        (dir) =>
          new ResourcePaths({
            dir,
            settings: { resources: { skills: ["skills"] } },
            type: opts.type,
          })
      )
    )
  }

  add(...res: ResourceProvider[]) {
    this.#providers.push(...res)
    this.refresh()
  }

  async packs() {
    const ret: string[] = []
    for (const res of this.#providers) {
      if (res instanceof ResourcePaths) ret.push(...res.packs.keys())
    }
    return ret
  }

  async _get(type: ResourceType): Promise<string[]> {
    if (this.#opts.settings?.resources?.[type] === false) return []
    const ret = await Promise.all(this.#providers.map(async (res) => res[type]()))
    return ret.flat()
  }

  override refresh() {
    super.refresh()
    this.#providers.forEach((res) => res.refresh())
  }
}
