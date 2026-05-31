import { isDeepStrictEqual } from "node:util"
import { Emitter } from "./emitter.ts"

type Select<T, Multi> = Multi extends true ? T[] : T | undefined

export type Collection<T, O, M extends boolean = false> = {
  load(opts: O): Promise<T>
  list(): Promise<O[]>
  active: Select<O, M>
  resolve(): Promise<Select<T, M>>
}

type CollectionEvents<O, M extends boolean> = {
  active: { active: Select<O, M>; prev: Select<O, M> }
}

export abstract class BaseCollection<T, O, M extends boolean = false>
  extends Emitter<CollectionEvents<O, M>>
  implements Collection<T, O, M>
{
  #loaded = new Map<O, T>()
  #active: Select<O, M>

  constructor(opts: { active: Select<O, M> }) {
    super()
    this.#active = opts.active
  }

  abstract list(): Promise<O[]>
  abstract load(opts: O): Promise<T>

  async resolve(): Promise<Select<T, M>> {
    const active = this.active
    if (active === undefined) return
  }

  get active(): Select<O, M> {
    return this.#active
  }

  set active(next: Select<O, M>) {
    const prev = this.#active
    if (isDeepStrictEqual(prev, next)) return // gate — don't fire on no-op
    this.#active = next
    void this.emit("active", { active: next, prev })
  }
}
