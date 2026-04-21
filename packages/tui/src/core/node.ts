import type { ActionMap } from "../input/keymap.ts"
import type { RoutedKey, RoutedPaste } from "../input/router.ts"
import type { Surface } from "../renderer/index.ts"
import type { BaseState, MountCtx, RenderCtx } from "./ctx.ts"
import type { Events } from "./emitter.ts"

import { Emitter } from "./emitter.ts"

export type { BaseState }

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
  S extends BaseState = BaseState,
  E extends BaseEvents = BaseEvents,
> extends Emitter<E> {
  #cache?: { rows: string[]; version: number }
  #parent?: Node
  #rendering: Promise<string[]> | undefined
  readonly #children: Node[] = []
  readonly #state: S
  readonly state: S
  #ctx?: MountCtx
  #id?: string
  actions?: ActionMap
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

  /** Mount context when this node is attached to a surface — surface
   *  identifier plus scoped handles to router / overlay / tree lookups.
   *  `undefined` before mount and after unmount. Exposed so widget
   *  authors can reach renderer services without closing over a ref. */
  get ctx(): MountCtx | undefined {
    return this.#ctx
  }

  get surface(): Surface | undefined {
    return this.#ctx?.surface
  }

  get mounted(): boolean {
    return this.#ctx !== undefined
  }

  /**
   * Read or set the node's `id`. Called without args, returns the
   * current id. Called with a string, sets it and returns `this` for
   * chaining — useful when building trees inline:
   *
   * ```ts
   * input({...}).id("chat-input").focus().on("submit", ...)
   * ```
   *
   * The id is used by `ctx.getNode(id)` / `Renderer.getNode(id)` for
   * tree lookups, and by the input router as a per-instance scope for
   * keymap bindings (alongside the class-level `type`).
   */
  id(): string | undefined
  id(value: string): this
  id(value?: string): string | undefined | this {
    if (value === undefined) return this.#id
    this.#id = value
    return this
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
    // `visible: false` on the state suppresses the render entirely —
    // no `_render` call, no cached rows, zero layout footprint. Opt-in
    // via `state.visible`; absence or `true` is the default shown path.
    // Useful for toggled panels (autocomplete, log, modals) that should
    // stick around in the tree so we don't re-create them each time.
    if (this.state.visible === false) return []
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
      if (c.mounted) c.unmount()
      if (c.parent === this) c.#parent = undefined
    }
    for (const c of filtered) {
      // Detach from old parent before rewriting `#parent`, so the old
      // parent's `remove()` path observes a consistent `c.parent === old`
      // and cleans up its own bookkeeping.
      if (c.parent && c.parent !== this) {
        c.unmount()
        c.parent.remove(c)
      }
      c.#parent = this
      this.emit("childadded", c)
      if (this.#ctx !== undefined) c.mount(this.#ctx)
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

  mount(ctx: MountCtx): this {
    if (this.#ctx?.surface === ctx.surface) return this
    if (this.#ctx) {
      throw new Error(
        `Node is already mounted on "${this.#ctx.surface}" (requested "${ctx.surface}"). Unmount first if you meant to move it.`,
      )
    }
    this.#ctx = ctx
    this.emit("mount")
    for (const c of this.#children) c.mount(ctx)
    return this
  }

  unmount(): this {
    if (!this.#ctx) return this
    for (const c of this.#children) c.unmount()
    this.emit("unmount")
    this.#ctx = undefined
    return this
  }

  /** Become the focused node. Routes through the MountCtx, which emits
   *  `blur` on the previous focus and `focus` on this node.
   *
   *  When called before the node is mounted (the common case for
   *  `input({ focus: true }).on(...)` style setup), the focus is
   *  deferred until the next `mount` event. That keeps the API
   *  synchronous and side-effect-free at build time — callers don't
   *  have to think about ordering. */
  focus(): this {
    if (!this.#ctx) {
      this.once("mount", () => this.focus())
      return this
    }
    this.#ctx.input.focus(this)
    return this
  }

  /** Release focus. No-op when not mounted. */
  blur(): this {
    this.#ctx?.input.blur()
    return this
  }
}

/** Runtime type guard for Node. */
export function isNode(x: unknown): x is Node {
  return x instanceof Node
}
