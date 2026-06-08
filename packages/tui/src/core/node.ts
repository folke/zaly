import type { MaybePromise } from "@zaly/shared"
import type { TryResult } from "@zaly/shared/logger"
import type { ActionCtx, ActionDef, NodeActionMap } from "../input/actions.ts"
import type { RoutedKey, RoutedPaste } from "../input/router.ts"
import type { SurfaceType } from "../renderer/renderer.ts"
import type { MountCtx, RenderCtx } from "./ctx.ts"
import type { Ref, SignalStore } from "./reactive.ts"
import type { Layout, State } from "./state.ts"

import { Emitter } from "@zaly/shared"
import { createStore, inRenderContextOf, unwrap, withActiveNode } from "./reactive.ts"

/** Minimum event map every node carries. Custom event maps intersect
 *  this with their own events via `&`. */
export type BaseEvents = {
  invalidate: {}
  mount: {}
  unmount: {}
  focus: {}
  blur: {}
  show: {}
  hide: {}
  key: { key: RoutedKey }
  paste: { paste: RoutedPaste }
  childadded: { child: Node }
  childremoved: { child: Node }
}

/**
 * Public Node handle. Calling `render(ctx)` returns the node's rows from the
 * per-node cache, recomputing only if state read inside `_render` has changed
 * since the last call.
 *
 * Concrete subclasses implement the protected `_render(ctx)` hook; the public
 * `render` is the caching wrapper around it.
 *
 * State is a `createStore` proxy: reads inside `_render` track per-field;
 * mutating a read field invalidates this node. Three write forms:
 *
 *   - `n.state.field = value`               (direct assignment)
 *   - `n.state.set({ field: value, ... })`  (patch — partial merge)
 *   - `n.state.set(current => ({ ... }))`   (updater — receives untracked current)
 *
 * Writes through nested objects/arrays (`n.state.padding[0] = 1`) do NOT —
 * reassign the whole field instead.
 */
export abstract class Node<T extends object = object, E extends {} = {}> extends Emitter<
  BaseEvents,
  E
> {
  #cache?: { rows: string[]; version: number; width: number }
  #parent?: Node
  #rendering: Promise<string[]> | undefined
  /** Bumped on every `invalidate()`. Captured at the start of a render
   *  and re-checked after `_render` resolves: if the count moved, an
   *  external mutation landed during the render and the rows we just
   *  produced reflect pre-mutation state. We skip writing the cache in
   *  that case so the surface's already-scheduled re-paint sees a
   *  cache miss and re-renders against the latest state. */
  #invalidations = 0
  readonly #children: Node[] = []
  #state: SignalStore<T>
  #ctx?: MountCtx
  #id?: string
  #actionTargets = new Set<Node>()
  #mountAc?: AbortController
  actions?: NodeActionMap
  type?: string
  protected layout?(ctx: RenderCtx): MaybePromise<Layout | undefined>

  constructor(state: State<T>, ...children: Node[]) {
    super()
    this.onEmitError = (err) => {
      const logger = this.logger
      if (logger) logger.error(err)
      // oxlint-disable-next-line no-console
      else console.error("Uncaught node event error (node is unmounted, no ctx):", err)
    }
    // `createStore` gives us per-field reactivity for free: reads
    // inside `_render` subscribe via the rendering Node's tracking
    // ctx, so mutating a read field invalidates exactly this node.
    // Fields nobody reads never allocate a signal — mutation is just
    // a state update with no cascade. Finer-grained than the old
    // "any write invalidates everything" Proxy.
    this.#state = createStore(state)
    children.forEach((c) => this.add(c))
  }

  withEvents<Events extends {}>(): this & Emitter<Events> {
    return this as unknown as this & Emitter<Events>
  }

  withActions<A extends NodeActionMap>(actions: A): this & { actions: A } {
    this.actions ??= {}
    for (const [id, entry] of Object.entries(actions)) {
      this.actions[id] = entry
    }
    return this as this & { actions: A }
  }

  action(id: keyof NonNullable<this["actions"]> & string, opts?: Partial<ActionCtx>): boolean {
    const entry = this.actions?.[id]
    const fn = typeof entry === "function" ? entry : entry?.fn
    if (!fn) return false
    fn({ source: "programmatic", target: this, ...opts, id, node: this })
    return true
  }

  get mountSignal(): AbortSignal {
    this.#mountAc ??= new AbortController()
    return this.#mountAc.signal
  }

  get state(): SignalStore<T> & State<T> {
    return this.#state
  }

  get children(): readonly Node[] {
    return this.#children
  }

  protected get logger() {
    return this.#ctx?.logger.child({
      id: this.#id,
      name: "node",
      node: this.type ?? "unknown",
    })
  }

  protected try<R>(fn: () => R): TryResult<R> {
    const logger = this.logger
    if (!logger) return fn() as TryResult<R>
    return logger.try(fn) as TryResult<R>
  }

  /** Fragment protocol — opt-in. When defined, layout containers
   *  (Box's row/column allocator) treat this node as a transparent
   *  fragment and substitute the returned children for `this` during
   *  flex allocation and rendering. The fragment Node still exists in
   *  the tree (it's mounted; it bubbles invalidates from its
   *  descendants), but layout sees through it.
   *
   *  Used by `show`, `errorBoundary`, `suspense`: their children carry
   *  their own flex props through to the parent box, can share its
   *  `gap`, and a row containing a `show` with multiple flex children
   *  allocates per-leaf-slot rather than collapsing into one. */
  protected layoutChildren?(): readonly Node[]

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

  get surface(): SurfaceType | undefined {
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

  async getLayout(ctx: RenderCtx): Promise<Layout | undefined> {
    if (!this.layout) return
    return this.layout(ctx)
  }

  get layoutNodes(): readonly Node[] {
    if (this.layoutChildren === undefined) return [this]
    const ret: Node[] = []
    for (const c of this.with(() => this.layoutChildren?.()) ?? []) ret.push(...c.layoutNodes)
    return ret
  }

  addActionTarget(node: Node): this {
    this.#actionTargets.add(node)
    return this
  }

  removeActionTarget(node: Node): this {
    this.#actionTargets.delete(node)
    return this
  }

  get actionTargets(): Iterable<Node> {
    return this.#actionTargets
  }

  invalidate(): this {
    this.#cache = undefined
    // Suppress only when this invalidate originates from *inside this
    // node's own render call stack* — e.g. Markdown mutating its child
    // Text inside its own `_render`. The active render observes the
    // mutation as part of its own logic and produces rows that already
    // reflect it, so we skip the cascade *and* the generation bump:
    // the cache writeback at the end of the render is valid.
    //
    // External mutations (network callbacks, event handlers) and
    // mutations cascading up from a *deeper* render's own call stack
    // (e.g. Text._render mutating something that bubbles to Markdown
    // mid-Markdown-render) run outside *this* node's ALS scope, so
    // `inRenderContextOf(this)` returns `false` and they emit + bump
    // normally — the in-flight render's rows are stale, the cache
    // writeback gets skipped, and the surface schedules a fresh paint.
    if (inRenderContextOf(this)) return this
    this.#invalidations++
    // Always emit and always cascade — surfaces (stream, UI) dedupe
    // via their own `scheduled` flag, and the parent's cache always
    // includes whatever rows we returned last render, so a child
    // mutation always implies a stale parent cache. (We previously
    // skipped the cascade when `hadCache` was false, which was buggy:
    // a node that intentionally doesn't cache — e.g. one whose
    // `_render` mutates a child mid-render and skips the writeback —
    // would silently fail to dirty its parent on the next mutation,
    // pinning the surface to the first render's output.)
    void this.emit("invalidate")
    this.parent?.invalidate()
    return this
  }

  with<R>(fn: () => R): R {
    return withActiveNode(this, () => fn())
  }

  async render(ctx: RenderCtx): Promise<string[]> {
    // `visible: false` on the state suppresses the render entirely —
    // no `_render` call, no cached rows, zero layout footprint. Opt-in
    // via `state.visible`; absence or `true` is the default shown path.
    // Resolve inside the tracking ctx so a signal accessor read
    // subscribes this node. Async work registered via `createAsync` is
    // fire-and-forget here; surfaces that need a "wait until settled"
    // commit (Stream) install a `SuspenseContext` boundary at their
    // append boundary and await it before painting.
    this.#rendering ??= this.with(() => this.#render(ctx))

    try {
      return await this.#rendering
    } finally {
      this.#rendering = undefined
    }
  }

  async #render(ctx: RenderCtx): Promise<string[]> {
    // Cache the hidden result too, so a later `invalidate()` sees
    // `hadCache === true` and cascades up — otherwise a toggleable
    // panel (autocomplete, modal) whose first paint happened while
    // hidden would swallow the flip-to-visible invalidate.
    if (!(unwrap(this.state.visible) ?? true)) {
      this.#cache = { rows: [], version: ctx.version, width: ctx.width }
      return this.#cache.rows
    }
    // Cache key includes `ctx.width` because rendered output is
    // width-dependent. `version` alone catches state/theme mutations
    // (top-level bumps version on theme change), but a parent passing
    // a different `width` to the same node — common in flex
    // measure-then-allocate passes — needs a fresh render.
    if (this.#cache?.version === ctx.version && this.#cache.width === ctx.width) {
      return this.#cache.rows
    }
    // Capture the invalidation count *before* awaiting `_render`. If
    // it bumps mid-render, the rows we get back are based on stale
    // state — the external mutation that bumped it has already emitted
    // and re-scheduled the surface, so skip caching. The re-paint will
    // run a fresh `_render` against the latest state.
    const stamp = this.#invalidations
    const rows = await this._render(ctx)
    if (this.#invalidations === stamp) {
      this.#cache = { rows, version: ctx.version, width: ctx.width }
    }
    return rows
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
      void this.emit("childremoved", { child: c })
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
      void this.emit("childadded", { child: c })
      if (this.#ctx !== undefined) c.mount(this.#ctx)
    }
    this.invalidate()
    return this
  }

  clear(): this {
    this.splice(0, this.#children.length)
    return this
  }

  mount(ctx: MountCtx): this {
    if (this.#ctx?.surface === ctx.surface) return this
    if (this.#ctx) {
      throw new Error(
        `Node is already mounted on "${this.#ctx.surface}" (requested "${ctx.surface}"). Unmount first if you meant to move it.`
      )
    }
    // Make sure state.visible is tracked and will trigger invalidate
    withActiveNode(this, () => unwrap(this.state.visible))
    this.#ctx = ctx
    this.#registerActionMeta(ctx)
    void this.emit("mount")
    for (const c of this.#children) c.mount(ctx)
    return this
  }

  /** Contribute any `ActionInfo`-shaped entries in `this.actions` to
   *  the catalog. The instance `fn` stays on the node (dispatch finds
   *  it via the focus-chain walk); only metadata lands in the registry.
   *  Uses `extend: false` so defaults don't clobber user overrides
   *  that were registered before the widget mounted. */
  #registerActionMeta(ctx: MountCtx): void {
    if (!this.actions) return
    const metas: Record<string, ActionDef> = {}
    let any = false
    for (const [id, entry] of Object.entries(this.actions)) {
      if (typeof entry === "function") continue
      const { fn: _fn, ...info } = entry
      metas[id] = info
      any = true
    }
    if (any) ctx.actions.register(metas, { default: true })
  }

  unmount(): this {
    if (!this.#ctx) return this
    this.#mountAc?.abort()
    this.#mountAc = undefined
    for (const c of this.#children) c.unmount()
    void this.emit("unmount")
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

  get visible() {
    return unwrap(this.state.visible) ?? true
  }

  show(): this {
    if (this.visible) return this
    this.state.visible = true
    void this.emit("show")
    return this
  }

  hide(): this {
    if (!this.visible) return this
    this.state.visible = false
    void this.emit("hide")
    return this
  }

  toggle(): this {
    this.state.visible = !this.visible
    return this
  }

  ref<N extends Node>(ref?: Ref<this extends N ? N : never>): this {
    if (ref) ref.value = this as unknown as typeof ref.value
    return this
  }

  isVisible(): boolean {
    return this.visible && (this.parent ? this.parent.isVisible() : true)
  }
}

/** Runtime type guard for Node.
 *
 * @internal*/
export function isNode(x: unknown): x is Node {
  return x instanceof Node
}
