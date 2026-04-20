import type { ActionMap } from "../input/keymap.ts"
import type { RoutedKey, RoutedPaste } from "../input/router.ts"
import type { RenderCtx } from "./ctx.ts"
import type { Events } from "./emitter.ts"

import { Emitter } from "./emitter.ts"

/** Minimum event map every node carries. Custom event maps must intersect. */
export interface BaseEvents extends Events {
  invalidate: []
  mount: []
  unmount: []
  focus: []
  blur: []
  key: [RoutedKey]
  paste: [RoutedPaste]
  childadded: [child: Node]
  childremoved: [child: Node]
}

/**
 * Public Node handle. Calling `render(ctx)` returns the node's rows from the
 * per-node cache, recomputing only if state has changed since the last call.
 *
 * Concrete subclasses implement the protected `_render(ctx)` hook; the public
 * `render` is the caching wrapper around it.
 *
 * State is a shallow Proxy: `n.state.field = value` auto-invalidates. Writes
 * through nested objects/arrays (`n.state.padding[0] = 1`) do NOT — reassign
 * the whole field instead.
 */

export abstract class Node<
  S extends object = object,
  E extends BaseEvents = BaseEvents,
> extends Emitter<E> {
  #cache?: { rows: string[]; version: number }
  #parent?: Node
  #rendering: Promise<string[]> | undefined
  readonly #children: Node[] = []
  readonly #state: S
  readonly state: S
  actions?: ActionMap
  id?: string
  type?: string

  constructor(state: S, ...children: Node[]) {
    super()
    this.#state = state
    this.state = new Proxy(state, {
      set: (target, key, value) => {
        if (Reflect.get(target, key) === value) return true
        Reflect.set(target, key, value)
        this.invalidate()
        return true
      },
    })
    children.forEach((c) => this.add(c))
  }

  get children(): readonly Node[] {
    return this.#children
  }

  // Make parent readonly
  get parent(): Node | undefined {
    return this.#parent
  }

  setState(patch: Partial<S>): this {
    let changed = false
    for (const key of Object.keys(patch) as (keyof S)[]) {
      const next = patch[key]
      if (this.#state[key] !== next) {
        this.#state[key] = next as S[keyof S]
        changed = true
      }
    }
    if (changed) this.invalidate()
    return this
  }

  invalidate(): this {
    // Always emit — surfaces (stream, UI) dedupe via their own
    // `scheduled` flag, and a brand-new node whose cache has never
    // been populated still needs to notify its surface that it wants
    // a first flush. Cascade upward only when we actually had cached
    // state to invalidate, so idle ancestor walks don't repeat for
    // back-to-back state writes.
    const hadCache = this.#cache !== undefined
    this.#cache = undefined
    // avoid cascade during an active render, state mutations are allowed
    if (this.#rendering) return this
    this.emit("invalidate")
    if (hadCache) this.parent?.invalidate()
    return this
  }

  async render(ctx: RenderCtx): Promise<string[]> {
    this.#rendering ??= (async () => {
      if (this.#cache?.version !== ctx.version) {
        this.#cache = { rows: await this._render(ctx), version: ctx.version }
      }
      return this.#cache.rows
    })()
    try {
      return await this.#rendering
    } finally {
      this.#rendering = undefined
    }
  }

  protected abstract _render(ctx: RenderCtx): Promise<string[]> | string[]

  add(child: Node): this {
    this.splice(this.#children.length, 0, child)
    return this
  }

  remove(child: Node): this {
    const i = this.#children.indexOf(child)
    if (i === -1) return this
    this.splice(i, 1)
    return this
  }

  splice(start: number, deleteCount: number, ...items: Node[]): this {
    // Reject self-insertion — a node in its own children list would
    // create a cycle and stack-overflow on traversal.
    const filtered: Node[] = []
    for (const c of items) {
      if (c === this) continue
      filtered.push(c)
    }

    // If any item is already a child of this container, pull it out
    // first so we don't end up with duplicates. Adjust `start` when a
    // removal falls before it so the caller-relative index is preserved.
    let adjustedStart = Math.max(0, Math.min(start, this.#children.length))
    for (const c of filtered) {
      if (c.parent !== this) continue
      const i = this.#children.indexOf(c)
      if (i === -1) continue
      this.#children.splice(i, 1)
      if (i < adjustedStart) adjustedStart--
    }

    const removed = this.#children.splice(adjustedStart, deleteCount, ...filtered)
    for (const c of removed) {
      this.emit("childremoved", c)
      if (c.parent === this) c.#parent = undefined
    }
    for (const c of filtered) {
      // Detach from old parent before rewriting `#parent`, so the old
      // parent's `remove()` path observes a consistent `c.parent === old`
      // and cleans up its own bookkeeping.
      if (c.parent && c.parent !== this) c.parent.remove(c)
      c.#parent = this
      this.emit("childadded", c)
    }
    this.invalidate()
    return this
  }

  clear(): this {
    this.splice(0, this.#children.length)
    return this
  }

  omitFromState<K extends keyof S>(...keys: K[]): Omit<S, K> {
    const result = { ...this.#state } as Omit<S, K>
    for (const k of keys) delete (result as S)[k]
    return result
  }
}

/** Runtime type guard for Node. */
export function isNode(x: unknown): x is Node {
  return x instanceof Node
}
