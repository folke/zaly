import type { RenderCtx } from "./ctx.ts"
import type { TypedEmitter } from "./emitter.ts"

import { ohash } from "../util.ts"
import { Emitter } from "./emitter.ts"

/** Minimum event map every node carries. Custom event maps must intersect. */
export type BaseEvents = {
  invalidate: []
  mount: []
  unmount: []
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
export interface Node<
  S extends object = object,
  E extends BaseEvents = BaseEvents,
> extends TypedEmitter<E> {
  state: S
  parent?: Node
  setState(patch: Partial<S>): this
  invalidate(): this
  render(ctx: RenderCtx): string[]
}

export abstract class NodeBase<S extends object = object, E extends BaseEvents = BaseEvents>
  extends Emitter<E>
  implements Node<S, E>
{
  readonly state: S
  readonly #state: S
  parent?: Node
  #cache?: { rows: string[]; key: string }

  constructor(initialState: S) {
    super()
    this.#state = initialState
    this.state = new Proxy(initialState, {
      set: (target, key, value) => {
        if (Reflect.get(target, key) === value) return true
        Reflect.set(target, key, value)
        this.invalidate()
        return true
      },
    })
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
    if (this.#cache === undefined) return this
    this.#cache = undefined
    this.emit("invalidate")
    this.parent?.invalidate()
    return this
  }

  render(ctx: RenderCtx): string[] {
    const key = ohash(ctx, { force: !this.parent }) // force ctx hashing at the root to detect theme/width changes
    if (this.#cache?.key !== key) this.#cache = { key, rows: this._render(ctx) }
    return this.#cache.rows
  }

  protected abstract _render(ctx: RenderCtx): string[]
}

/** Runtime type guard for Node. */
export function isNode(x: unknown): x is Node {
  return x instanceof NodeBase
}
