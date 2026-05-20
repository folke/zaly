import { isInstance } from "./utils.ts"

export type LazyLoader<T = unknown, O extends object = object> = (opts?: O) => Promise<T> | T

export type LazyOpt<L extends LazyLoader> =
  | NonNullable<Parameters<L>[0]>
  | boolean
  | Awaited<ReturnType<L>>

export type LazyValue<L extends LazyLoader> = Awaited<ReturnType<L>>
export type LazyPromise<L extends LazyLoader> = Promise<LazyValue<L>>

export type LazyMap = Record<string, unknown>

export class LazyCache<T extends LazyMap = LazyMap> {
  #proms = new Map<keyof T, Promise<unknown>>()

  async want<K extends keyof T, L extends LazyLoader<T[K]>>(
    key: K,
    loader: L,
    opts?: LazyOpt<L>
  ): Promise<LazyValue<L> | undefined> {
    let prom = this.#proms.get(key)
    if (prom) return prom as LazyPromise<L>

    const spec = opts
    if (spec === false) return undefined
    else if (isInstance(spec)) return spec as LazyValue<L>

    prom = Promise.resolve(loader(spec === true ? undefined : spec)).catch((error) => {
      this.#proms.delete(key)
      throw error
    })
    this.#proms.set(key, prom)
    return prom as LazyPromise<L>
  }

  async need<K extends keyof T, L extends LazyLoader<T[K]>>(
    key: K,
    loader: L,
    opts?: Exclude<LazyOpt<L>, false>
  ): Promise<LazyValue<L>> {
    const res = await this.want(key, loader, opts)
    if (res === undefined)
      throw new Error(`\`LazyContext.need("${String(key)}")\`: loader returned \`undefined\``)
    return res as LazyValue<L>
  }

  forget(key: keyof T): void {
    this.#proms.delete(key)
  }

  async wait(): Promise<void> {
    await Promise.all(this.#proms.values())
  }
}
