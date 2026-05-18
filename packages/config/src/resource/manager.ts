import type { Config, LoadedSettings } from "../types.ts"
import type { ResourceType } from "./resource.ts"

import { ResourcePack, ResourcePaths, ResourceProvider } from "./resource.ts"

export class ResourceManager extends ResourceProvider {
  #providers: ResourceProvider[] = []

  constructor(opts: Omit<Config, "resources">) {
    super()
    this.#add({ dotAgents: ["~/.agents"], ...opts.user })
    if (opts.project.settings)
      this.#add({
        dotAgents: opts.paths.dotAgents,
        ...opts.project,
      })
  }

  #add(opts: LoadedSettings & { dotAgents?: string[] }) {
    const res = new ResourcePaths(opts)
    this.add(
      ...(opts.dotAgents ?? []).map(
        (dir) =>
          new ResourcePaths({
            dir,
            settings: {
              resources: { skills: ["skills"] },
            },
            type: opts.type,
          })
      ),
      ...res.packs.values(),
      new ResourcePack(opts),
      res
    )
  }

  add(...res: ResourceProvider[]) {
    this.#providers.push(...res)
    this.refresh()
  }

  async _get(type: ResourceType): Promise<string[]> {
    const ret = await Promise.all(this.#providers.map(async (res) => res[type]()))
    return ret.flat()
  }

  override refresh() {
    super.refresh()
    this.#providers.forEach((res) => res.refresh())
  }
}
