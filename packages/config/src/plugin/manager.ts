import type { PluginRef, PluginType } from "./uri.ts"

export type PluginInfo = {
  hasUpdate: boolean
  installed: boolean
}

export abstract class Plugin<T extends PluginType = PluginType> {
  source: PluginRef<T>
  opts: PluginManagerOpts

  constructor(source: PluginRef<T>, opts: PluginManagerOpts) {
    this.opts = opts
    this.source = source
  }

  is<P extends T>(type: P): this is Plugin<P> {
    return this.source.type === type
  }

  async info(): Promise<PluginInfo> {
    return { hasUpdate: await this.hasUpdate(), installed: await this.installed() }
  }

  /** Fast check if the pack is installed. This should NOT execute any commands */
  abstract installed(): Promise<boolean>
  abstract install(): Promise<void>
  abstract update(): Promise<boolean>
  abstract hasUpdate(): Promise<boolean>
}

export class PluginStore<T extends PluginType = PluginType> {
  constructor(
    public store: string,
    public opts: PluginManagerOpts
  ) {}

  async install(plugins: Plugin<T>[]): Promise<void> {
    await Promise.all(plugins.map((p) => p.install()))
  }

  async update(plugins: Plugin<T>[]): Promise<void> {
    await Promise.all(plugins.map((p) => p.update()))
  }
}

export type PluginManagerOpts = {
  /** Git command. Defaults to `git` */
  git: string[]
  /** Npm command. Defaults to `npm` */
  npm: string[]
}

export class PluginManager {
  #opts: PluginManagerOpts
  #refs: PluginRef[]
  #stores = new Map<string, PluginStore>()
  #plugins?: Plugin[]

  constructor(packs: PluginRef[], opts: Partial<PluginManagerOpts> = {}) {
    this.#opts = {
      git: opts.git ?? ["git"],
      npm: opts.npm ?? ["npm"],
    }
    this.#refs = packs
    if (packs.length === 0) this.#stores = new Map()
  }

  async #store(pack: Plugin): Promise<PluginStore> {
    let store = this.#stores.get(pack.source.store)
    if (store) return store
    if (pack.is("git")) {
      store = new PluginStore(pack.source.store, this.#opts)
    } else if (pack.is("npm")) {
      const { NpmStore } = await import("./npm.ts")
      store = new NpmStore(pack.source.store, this.#opts) as PluginStore
    } else throw new Error(`Unsupported pack type: ${pack.source.type}`)
    this.#stores.set(pack.source.store, store)
    return store
  }

  async packs(): Promise<Plugin[]> {
    if (this.#plugins) return this.#plugins
    this.#plugins = []

    const git = this.#refs.filter((p) => p.type === "git") as PluginRef<"git">[]
    if (git.length > 0) {
      const { GitPlugin } = await import("./git.ts")
      this.#plugins.push(...git.map((p) => new GitPlugin(p, this.#opts)))
    }

    const npm = this.#refs.filter((p) => p.type === "npm") as PluginRef<"npm">[]
    if (npm.length > 0) {
      const { NpmPlugin } = await import("./npm.ts")
      this.#plugins.push(...npm.map((p) => new NpmPlugin(p, this.#opts)))
    }

    return this.#plugins
  }

  async missing(): Promise<Plugin[]> {
    const packs = await this.packs()
    const installed = await Promise.all(packs.map(async (p) => p.installed()))
    return packs.filter((_, i) => !installed[i])
  }

  async updates(): Promise<Plugin[]> {
    const packs = await this.packs()
    const updates = await Promise.all(packs.map(async (p) => p.hasUpdate()))
    return packs.filter((_, i) => updates[i])
  }

  async #byStore(packs: Plugin[]): Promise<[PluginStore, Plugin[]][]> {
    const ret = new Map<string, Plugin[]>()
    for (const pack of packs) {
      let p = ret.get(pack.source.store)
      if (!p) ret.set(pack.source.store, (p = []))
      p.push(pack)
    }
    return Promise.all(
      [...ret.entries()].map(
        async ([_, ps]) => [await this.#store(ps[0]), ps] as [PluginStore, Plugin[]]
      )
    )
  }

  async install(packs?: Plugin[]): Promise<void> {
    packs ??= await this.missing()
    if (packs.length === 0) return
    const byStore = await this.#byStore(packs)
    await Promise.all(byStore.map(async ([store, ps]) => await store.install(ps)))
  }

  async update(packs?: Plugin[]): Promise<void> {
    packs ??= await this.updates()
    if (packs.length === 0) return
    const byStore = await this.#byStore(packs)
    await Promise.all(byStore.map(async ([store, ps]) => await store.update(ps)))
  }
}
