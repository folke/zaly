import type { PackPath, PackType, PackUri } from "./uri.ts"

export type PackInfo = {
  hasUpdate: boolean
  installed: boolean
}

export abstract class Pack<T extends PackType = PackType> {
  parsed: PackUri<T>
  uri: string
  dir: string
  store: string
  opts: PackManagerOpts

  constructor(packPath: PackPath<T>, opts: PackManagerOpts) {
    this.opts = opts
    this.parsed = packPath.parsed
    this.dir = packPath.dir
    this.store = packPath.store
    this.uri = packPath.uri
  }

  is<P extends T>(type: P): this is Pack<P> {
    return this.parsed.type === type
  }

  async info(): Promise<PackInfo> {
    return { hasUpdate: await this.hasUpdate(), installed: await this.installed() }
  }

  /** Fast check if the pack is installed. This should NOT execute any commands */
  abstract installed(): Promise<boolean>
  abstract install(): Promise<void>
  abstract update(): Promise<boolean>
  abstract hasUpdate(): Promise<boolean>
}

export class PackStore<T extends PackType = PackType> {
  constructor(
    public store: string,
    public opts: PackManagerOpts
  ) {}

  async install(packs: Pack<T>[]): Promise<void> {
    await Promise.all(packs.map((p) => p.install()))
  }

  async update(packs: Pack<T>[]): Promise<void> {
    await Promise.all(packs.map((p) => p.update()))
  }
}

export type PackManagerOpts = {
  /** Git command. Defaults to `git` */
  git: string[]
  /** Npm command. Defaults to `npm` */
  npm: string[]
}

export class PackManager {
  #opts: PackManagerOpts
  #paths: PackPath[]
  #stores = new Map<string, PackStore>()
  #packs?: Pack[]

  constructor(packs: PackPath[], opts: Partial<PackManagerOpts> = {}) {
    this.#opts = {
      git: opts.git ?? ["git"],
      npm: opts.npm ?? ["npm"],
    }
    this.#paths = packs
    if (packs.length === 0) this.#stores = new Map()
  }

  async #store(pack: Pack): Promise<PackStore> {
    let store = this.#stores.get(pack.store)
    if (store) return store
    if (pack.is("git")) {
      store = new PackStore(pack.store, this.#opts)
    } else if (pack.is("npm")) {
      const { NpmStore } = await import("./npm.ts")
      store = new NpmStore(pack.store, this.#opts) as PackStore
    } else throw new Error(`Unsupported pack type: ${pack.parsed.type}`)
    this.#stores.set(pack.store, store)
    return store
  }

  async packs(): Promise<Pack[]> {
    if (this.#packs) return this.#packs
    this.#packs = []

    const gitPaths = this.#paths.filter((p) => p.parsed.type === "git") as PackPath<"git">[]
    if (gitPaths.length > 0) {
      const { GitPack } = await import("./git.ts")
      this.#packs.push(...gitPaths.map((p) => new GitPack(p, this.#opts)))
    }

    const npmPaths = this.#paths.filter((p) => p.parsed.type === "npm") as PackPath<"npm">[]
    if (npmPaths.length > 0) {
      const { NpmPack } = await import("./npm.ts")
      this.#packs.push(...npmPaths.map((p) => new NpmPack(p, this.#opts)))
    }

    return this.#packs
  }

  async missing(): Promise<Pack[]> {
    const packs = await this.packs()
    const installed = await Promise.all(packs.map(async (p) => p.installed()))
    return packs.filter((_, i) => !installed[i])
  }

  async updates(): Promise<Pack[]> {
    const packs = await this.packs()
    const updates = await Promise.all(packs.map(async (p) => p.hasUpdate()))
    return packs.filter((_, i) => updates[i])
  }

  async #byStore(packs: Pack[]): Promise<[PackStore, Pack[]][]> {
    const ret = new Map<string, Pack[]>()
    for (const pack of packs) {
      let p = ret.get(pack.store)
      if (!p) ret.set(pack.store, (p = []))
      p.push(pack)
    }
    return Promise.all(
      [...ret.entries()].map(
        async ([_, ps]) => [await this.#store(ps[0]), ps] as [PackStore, Pack[]]
      )
    )
  }

  async install(packs?: Pack[]): Promise<void> {
    packs ??= await this.missing()
    if (packs.length === 0) return
    const byStore = await this.#byStore(packs)
    await Promise.all(byStore.map(async ([store, ps]) => await store.install(ps)))
  }

  async update(packs?: Pack[]): Promise<void> {
    packs ??= await this.updates()
    if (packs.length === 0) return
    const byStore = await this.#byStore(packs)
    await Promise.all(byStore.map(async ([store, ps]) => await store.update(ps)))
  }
}
