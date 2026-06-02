import { isDeepStrictEqual } from "node:util"
import { Emitter } from "./emitter.ts"

export type Collection<A, L, R> = {
  active: A
  list(): L
  register(value: R): void
}

export type CollectionEvents<A, R> = {
  active: { active: A; prev: A }
  register: { value: R }
  unregister: { value: R }
}

export abstract class BaseCollection<A, L, R>
  extends Emitter<CollectionEvents<A, R>>
  implements Collection<A, L, R>
{
  #active: A
  #registered: R[] = []

  constructor(active: A) {
    super()
    this.#active = active
  }

  get registered() {
    return this.#registered
  }

  abstract list(): L

  get active() {
    return this.#active
  }

  set active(next: A) {
    const prev = this.#active
    this.#active = next
    if (isDeepStrictEqual(prev, next)) return
    void this.emit("active", { active: next, prev })
  }

  register(value: R): () => void {
    this.#registered.push(value)
    void this.emit("register", { value })
    return () => {
      const idx = this.#registered.indexOf(value)
      if (idx !== -1) {
        this.#registered.splice(idx, 1)
        void this.emit("unregister", { value })
      }
    }
  }
}
