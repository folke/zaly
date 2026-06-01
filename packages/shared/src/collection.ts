import type { Registry } from "./registry.ts"

import { isDeepStrictEqual } from "node:util"
import { Emitter } from "./emitter.ts"

export type Select<T, Multi> = Multi extends true ? T[] : T | undefined

export type Selection<T, O, M extends boolean = false> = {
  readonly active: Select<T, M>
  readonly selection: Select<O, M>
  select(next: Select<O, M>): Promise<void>
}

export type Collection<T, O, M extends boolean = false> = Selection<T, O, M> & {
  get(opts: O): Promise<T>
  list(): Promise<O[]>
}

type SelectionEvents<T, O, M extends boolean> = {
  change: {
    readonly active: Select<T, M>
    readonly selection: Select<O, M>
    readonly prev: {
      readonly active: Select<T, M>
      readonly selection: Select<O, M>
    }
  }
}

export abstract class BaseSelection<T, O, M extends boolean = false>
  extends Emitter<SelectionEvents<T, O, M>>
  implements Selection<T, O, M>
{
  #loaded = new Map<O, T>()
  #selection: Select<O, M>
  #active: Select<T, M>

  constructor(opts: { multi: M }) {
    super()
    this.#active = (opts.multi ? [] : undefined) as Select<T, M>
    this.#selection = (opts.multi ? [] : undefined) as Select<O, M>
  }

  get active(): Select<T, M> {
    return this.#active
  }

  get selection(): Select<O, M> {
    return this.#selection
  }

  protected abstract _load(opts: O): Promise<T>

  protected async load(opts: O): Promise<T> {
    if (this.#loaded.has(opts)) return Promise.resolve(this.#loaded.get(opts)!)
    const ret = await this._load(opts)
    this.#loaded.set(opts, ret)
    return ret
  }

  async select(next: Select<O, M>): Promise<void> {
    const prevSelection = this.#selection
    const prevActive = this.#active
    if (isDeepStrictEqual(prevSelection, next)) return // gate — don't fire on no-op

    this.#active = await this.#resolve(next)
    this.#selection = next

    await this.emit("change", {
      active: this.#active,
      prev: { active: prevActive, selection: prevSelection },
      selection: this.#selection,
    })
  }

  async #resolve(next: Select<O, M>): Promise<Select<T, M>> {
    if (next === undefined) return undefined as Select<T, M>
    else if (Array.isArray(next))
      return Promise.all(next.map((a) => this.load(a))) as Promise<Select<T, M>>
    return this.load(next as O) as Promise<Select<T, M>>
  }
}

export abstract class BaseCollection<T, O, M extends boolean = false>
  extends BaseSelection<T, O, M>
  implements Collection<T, O, M>
{
  abstract list(): Promise<O[]>

  async get(opts: O): Promise<T> {
    return this.load(opts)
  }
}

export class RegistryCollection<T, M extends boolean = false> extends BaseCollection<T, string, M> {
  #registry: Registry<() => Promise<T>>

  constructor(opts: { registry: Registry<() => Promise<T>>; multi: M }) {
    super(opts)
    this.#registry = opts.registry
  }

  protected async _load(opts: string): Promise<T> {
    return this.#registry.load(opts)
  }

  async list(): Promise<string[]> {
    return this.#registry.keys()
  }
}
