import type { RenderCtx } from "./ctx.ts"
import type { Node } from "./node.ts"

import { AsyncLocalStorage } from "node:async_hooks"

/**
 * Solid-style fine-grained reactivity.
 *
 * `signal(initial)` → `[read, write]` tuple. Reads inside a
 * tracking context (node render, effect, memo) auto-subscribe;
 * writes invalidate every subscriber. Cross-async-boundary tracking
 * uses `AsyncLocalStorage` so reads after an `await` still subscribe
 * the correct context.
 *
 * ```ts
 * const [status, setStatus] = signal("streaming")
 * text(({ style }) => style.success(status()))   // auto-subscribes
 * setStatus("done")
 * ```
 *
 * Builds on three primitives:
 *   - `signal`    — reactive value.
 *   - `memo`      — cached derived signal.
 *   - `effect`    — imperative side-effect that re-runs on dep change.
 *
 * Widgets expose `Reactive<T>` props and call `unwrap()` inside
 * `_render` to resolve them — that's the bridge from app-level
 * signals into the render tree.
 */

// ---- tracking context ------------------------------------------------

/** Context carried through a tracking scope. Subscribers that want to
 *  be signal-aware implement this; signals read the current context
 *  during `read()` and add `notify` to their subscriber set. `register`
 *  lets the context remember the cleanup closure so it can
 *  unsubscribe later (on unmount / dispose / re-run). */
interface TrackingCtx {
  notify: () => void
  register: (cleanup: () => void) => void
}

const activeCtx = new AsyncLocalStorage<TrackingCtx | undefined>()

function withTracking<T>(ctx: TrackingCtx, fn: () => T): T {
  return activeCtx.run(ctx, fn)
}

/** Run `fn` outside any tracking scope. Signal reads inside don't
 *  subscribe the surrounding render, and async work started inside
 *  (timers, promises, intervals) doesn't capture the current ctx —
 *  callbacks fire with `getStore() === undefined`.
 *
 *  Use this when starting persistent async work from inside a render
 *  pass: a `setInterval` set up during `_render` would otherwise
 *  inherit the render's ALS context, and every timer tick would look
 *  like it's "inside" that render — its invalidates would be silently
 *  suppressed.
 *
 *  ```ts
 *  // inside _render() or a render-driven reconcile():
 *  untracked(() => {
 *    this.#timer = setInterval(() => this.invalidate(), speed)
 *  })
 *  ```
 *
 *  Equivalent to Solid's `untrack`. */
export function untrack<T>(fn: () => T): T {
  return activeCtx.run(undefined, fn)
}

// ---- context ---------------------------------------------------------

/**
 * Solid-style context for sharing values down the owner chain without
 * prop-drilling. Widgets publish values via `provideContext` (in setup
 * or `_render`); descendants read via `useContext`.
 *
 * ```ts
 * const ThemeOverride = createContext<Theme | undefined>(undefined)
 *
 * // provider (in a widget body / setup / _render):
 * provideContext(ThemeOverride, customTheme)
 *
 * // consumer (anywhere with an active node or owner chain):
 * const theme = useContext(ThemeOverride) ?? defaultTheme
 * ```
 *
 * Implementation: each `Node` carries an optional `#contexts` map keyed
 * by context id. Lookups walk the *owner frame chain* (`OwnerFrame.owner`
 * pointers), reading the live `#contexts` of each frame's node and
 * falling back to the context's default if no ancestor provides it.
 *
 * The owner chain is the render-call ancestry captured at frame push
 * (via `withActiveNode`) — independent of mount status. Effects/memos
 * capture their creation frame and re-establish it on re-fire, so
 * detached re-runs walk the same chain they would have at creation.
 */
export interface Context<T> {
  readonly id: symbol
  readonly defaultValue: T
}

export function createContext<T>(): Context<T | undefined>
export function createContext<T>(defaultValue: T): Context<T>
export function createContext<T>(defaultValue?: T): Context<T | undefined> {
  return { defaultValue, id: Symbol("@zaly/tui/context") }
}

/** Publish `value` for `ctx` on the active Owner. Persistent for the
 *  Owner's lifetime. Descendants (in the render-call sense) that read
 *  via `useContext` walk up the Owner chain and find it. */
export function provideContext<T>(ctx: Context<T>, value: T): void {
  const owner = activeOwnerStore.getStore()
  if (owner === undefined) {
    throw new Error("provideContext: no active Owner — call from a widget body / _render")
  }
  owner.setContext(ctx.id, value)
}

/** Read the current value of `ctx`. Walks the Owner chain
 *  (render-call ancestry, not mount tree). Returns the context's
 *  default when no ancestor has provided a value. */
export function useContext<T>(ctx: Context<T>): T {
  for (let o = activeOwnerStore.getStore(); o !== undefined; o = o.parent) {
    const map = o.contexts
    if (map?.has(ctx.id)) return map.get(ctx.id) as T
  }
  return ctx.defaultValue
}

// ---- public types ----------------------------------------------------

/** Brand tag: every accessor / setter returned by `signal` / `memo`
 *  carries this symbol so `unwrap` can tell a reactive source from a
 *  plain function-valued prop (label formatter, text callback, etc.). */
const REACTIVE = Symbol.for("@zaly/tui/reactive")

export type Signal<T> = readonly [get: Accessor<T>, set: Setter<T>] & {
  readonly get: Accessor<T>
  readonly set: Setter<T>
}

/** A read-only reactive source. Branded so `isAccessor` can detect it
 *  without false positives on arbitrary callables. */
export type Accessor<T> = (() => T) & { readonly [REACTIVE]: "get" }

/** A signal setter. Same branding as `Accessor` (different tag) so a
 *  setter isn't mistaken for an accessor by `unwrap`. */
export type Setter<T> = ((next: T | ((prev: T) => T)) => void) & { readonly [REACTIVE]: "set" }

/** A widget prop that's either a literal value or a reactive accessor. */
export type Reactive<T> = T | Accessor<T>

/** Runtime check: `true` when `v` was produced by `signal` / `memo`.
 *  False for plain callables (text-content functions, label formatters).
 *
 *  @internal */
export function isAccessor<T>(v: unknown): v is Accessor<T> {
  return typeof v === "function" && (v as { [REACTIVE]?: string })[REACTIVE] === "get"
}

/** Resolve a `Reactive<T>` to its current `T`. Call inside `_render`
 *  so accessor reads subscribe the rendering node. Only brand-tagged
 *  accessors are invoked — other function values pass through
 *  untouched, so widgets whose `T` is itself a function type (label
 *  formatters etc.) don't need a hand-rolled guard. */
export function unwrap<T>(v: Reactive<T>): T {
  return isAccessor<T>(v) ? v() : v
}

function brand<F extends (...args: any[]) => any>(fn: F, tag: "get" | "set"): F {
  Object.defineProperty(fn, REACTIVE, {
    configurable: false,
    enumerable: false,
    value: tag,
    writable: false,
  })
  return fn
}

// ---- Owner -----------------------------------------------------------

/**
 * Reactive ownership scope. Independent of mount-tree position: the
 * chain (`parent` pointers) mirrors the render-call ancestry, not
 * `Node.parent` — a transient node used for measurement still resolves
 * context correctly because its Owner's `parent` is whichever node's
 * render created it.
 *
 * For now there's a 1:1 mapping between `Node` and `Owner` — every
 * Node gets its own Owner the first time `withActiveNode` is called on
 * it, and the Owner disposes when the Node unmounts. A later refactor
 * may relax this to "Owner only at widget / surface boundaries," at
 * which point primitive Nodes wouldn't push their own Owner.
 *
 * Use `onCleanup(cb)` to register cleanups against the active Owner.
 * Disposing the Owner runs them in reverse-registration order.
 *
 * @internal
 */
export class Owner {
  parent?: Owner
  /** Host Node when the Owner is bound 1:1 to a Node (the common case
   *  via `withActiveNode`). `undefined` for headless roots created via
   *  `createRoot` whose body hasn't yet returned a Node (or doesn't). */
  node?: Node
  #cleanups: (() => void)[] = []
  #contexts?: Map<symbol, unknown>
  #disposed = false

  constructor(node?: Node, parent?: Owner) {
    this.node = node
    this.parent = parent
  }

  get disposed(): boolean {
    return this.#disposed
  }

  /** Live view of this Owner's provided contexts. Populated by
   *  `provideContext`. Walked upward via `parent` by `useContext`. */
  get contexts(): ReadonlyMap<symbol, unknown> | undefined {
    return this.#contexts
  }

  setContext(id: symbol, value: unknown): void {
    ;(this.#contexts ??= new Map()).set(id, value)
  }

  /** Register a cleanup. Runs on `dispose()`. */
  addCleanup(fn: () => void): void {
    if (this.#disposed) {
      fn()
      return
    }
    this.#cleanups.push(fn)
  }

  /** Fire cleanups in reverse-registration order. Idempotent. */
  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (let i = this.#cleanups.length - 1; i >= 0; i--) {
      try {
        this.#cleanups[i]()
      } catch (error) {
        // Don't let one bad cleanup poison the rest.
        // oxlint-disable-next-line no-console
        console.error("Owner cleanup threw:", error)
      }
    }
    this.#cleanups = []
    this.#contexts = undefined
  }
}

const activeOwnerStore = new AsyncLocalStorage<Owner | undefined>()
const nodeOwners = new WeakMap<Node, Owner>()

/** Run `fn` as the `node`'s render pass. Signal reads inside subscribe
 *  the node; subscriptions auto-clear on unmount. Stale deps across
 *  renders persist until unmount — mildly wasteful (extra
 *  invalidations), but cheaper than re-tracking per render and
 *  harmless (invalidate is idempotent).
 *
 *  Establishes an `Owner` for the node (lazy, 1:1) and pushes it as
 *  the active Owner for the duration of `fn`. `Owner.parent` is
 *  refreshed each call to mirror the current render-call ancestry, so
 *  `useContext` walks always see the most recent render's chain.
 *
 *  @internal */
export function withActiveNode<T>(node: Node, fn: () => T): T {
  const ctx = getNodeTrackingCtx(node)
  const owner = getOrCreateOwner(node)
  owner.parent = activeOwnerStore.getStore()
  return activeOwnerStore.run(owner, () => withTracking(ctx, fn))
}

/** Run `fn` with a pre-existing Owner restored. Used by `effect` /
 *  `memo` to re-establish their creation-time owner chain on re-fire,
 *  so `useContext` walks the same ancestry regardless of whether the
 *  re-fire was triggered from inside or outside a render.
 *
 *  @internal */
export function withOwner<T>(owner: Owner, fn: () => T): T {
  return activeOwnerStore.run(owner, fn)
}

function getOrCreateOwner(node: Node): Owner {
  let owner = nodeOwners.get(node)
  if (owner === undefined) {
    owner = new Owner(node, activeOwnerStore.getStore())
    nodeOwners.set(node, owner)
    // Wire Node unmount → Owner dispose. `once` so re-mounts don't
    // double-register; the Owner itself is idempotent on dispose.
    node.once("unmount", () => owner!.dispose())
  }
  return owner
}

function getNodeTrackingCtx(node: Node): TrackingCtx {
  let ctx = nodeCtx.get(node)
  if (ctx === undefined) {
    ctx = {
      notify: () => node.invalidate(),
      register: (cleanup) => {
        node.once("unmount", cleanup)
      },
    }
    nodeCtx.set(node, ctx)
  }
  return ctx
}

/** Create a fresh Owner scope and run `fn` inside it. Returns
 *  whatever `fn` returns. The Owner's parent is whatever was active at
 *  the call site (or `undefined` at module top).
 *
 *  The Owner is *not* auto-disposed — callers manage its lifetime via
 *  the Owner returned alongside the result, or (more commonly) by
 *  binding the Owner to a Node and disposing it on that Node's
 *  unmount.
 *
 *  Typical use is via a surface's function-shape `add(fn)` API which
 *  wraps this internally:
 *
 *  ```ts
 *  ui.add(() => {
 *    const [count, setCount] = signal(0)
 *    onCleanup(() => console.log("gone"))
 *    return text(() => `count: ${count()}`)
 *  })
 *  ```
 *
 *  For headless reactive scopes (tests, programmatic effects), call
 *  `createRoot` directly:
 *
 *  ```ts
 *  const { result, owner } = createRoot(() => signal(0))
 *  // ... use result ...
 *  owner.dispose()
 *  ```
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const parent = activeOwnerStore.getStore()
  const owner = new Owner(undefined, parent)
  return withOwner(owner, () => fn(() => owner.dispose()))
}

/** Resolve a `Node | (() => Node)` input to a `Node`. Bare-Node input
 *  passes through unchanged. Function input runs inside a fresh Owner
 *  scope (via `createRoot`); the Owner binds to the returned Node and
 *  disposes when the Node unmounts.
 *
 *  Surfaces and containers use this at the boundary where children
 *  enter the tree — `ui.add(createNode(child))`, `stream.append(...)`,
 *  etc. — so consumers can pass either shape uniformly.
 *
 *  ```ts
 *  ui.add(box({}, text("hi")))               // bare Node — no Owner scope
 *  ui.add(() => {
 *    const [c, setC] = signal(0)
 *    onCleanup(() => clearInterval(timer))
 *    const timer = setInterval(() => setC(x => x + 1), 1000)
 *    return text(() => `count: ${c()}`)
 *  })                                          // function — Owner scope per add
 *  ```
 */
export function createNode<T extends Node>(node: T | (() => T)): T {
  if (typeof node !== "function") return node
  return createRoot((dispose) => node().once("unmount", dispose))
}

/** Register a cleanup against the active Owner. Fires when the Owner
 *  disposes (which, in the 1:1 Node↔Owner model, means the Node
 *  unmounts).
 *
 *  ```ts
 *  function widgetBody() {
 *    const id = setInterval(() => tick(), 1000)
 *    onCleanup(() => clearInterval(id))
 *    return box(…)
 *  }
 *  ```
 *
 *  Throws if called outside any active Owner — the cleanup would
 *  never fire and the caller is almost certainly mistaken. */
export function onCleanup(fn: () => void): void {
  const owner = activeOwnerStore.getStore()
  if (owner === undefined) {
    throw new Error("onCleanup: no active Owner — call from inside a render / widget body")
  }
  owner.addCleanup(fn)
}

/** The `Node` whose render is currently active, or `undefined` outside
 *  any render. Used by widget-body helpers (`createRenderEffect`,
 *  `onMount`, …) to anchor lifecycle subscriptions to the owner.
 *
 *  @internal */
export function useActiveNode(): Node | undefined {
  return activeOwnerStore.getStore()?.node
}

/** Current Owner, or `undefined` outside any render. Captured by
 *  effects/memos at creation time and restored on re-fire.
 *
 *  @internal */
export function useActiveOwner(): Owner | undefined {
  return activeOwnerStore.getStore()
}

/**
 * Register a per-render hook on the active owner node. The callback
 * runs synchronously at the top of every `_render` (after the
 * `visible:false` short-circuit and the cache check, before
 * `_render`). Cache-hit renders skip it — `ctx.version` only bumps on
 * theme / resize / explicit ctx changes, so a cache hit means ctx
 * hasn't meaningfully changed.
 *
 * The callback receives the live `RenderCtx` directly — width, theme,
 * version, transmit. Use this to capture per-render data (theme, style)
 * into signals that async closures (`createAsync`) can read later, since
 * those run outside the render and don't have access to ctx.
 *
 * Auto-disposes on the owner's `unmount`. Idempotent re-mount: the
 * Node's emitter cleans up on unmount but the closure stays valid; if
 * the owner mounts again, callers who want re-attachment do so
 * explicitly.
 *
 * ```ts
 * const [theme, setTheme] = signal<Theme | undefined>(undefined)
 * createRenderEffect((ctx) => setTheme(ctx.style.theme))
 * ```
 */
export function createRenderEffect(fn: (ctx: RenderCtx) => void): void {
  const owner = useActiveNode()
  if (owner === undefined) {
    throw new Error("createRenderEffect must be called inside a node render")
  }
  const handler = (e: { ctx: RenderCtx }): void => fn(e.ctx)
  owner.on("render", handler)
  owner.once("unmount", () => owner.off("render", handler))
}

/** Whether we're currently executing inside `node`'s own render call
 *  stack — i.e. this code path was reached synchronously (or via an
 *  await preserved by `AsyncLocalStorage`) from `node`'s `withActiveNode`.
 *
 *  Used by `invalidate()` to suppress *internal* cascades — e.g.
 *  Markdown mutating its child Text inside its own `_render`. External
 *  mutations (network callbacks, event handlers) run outside any
 *  render's ALS scope, so this returns `false` for them and they emit
 *  normally even when a render is in flight.
 *
 *  @internal */
export function inRenderContextOf(node: Node): boolean {
  const active = activeCtx.getStore()
  return active !== undefined && active === nodeCtx.get(node)
}

const nodeCtx = new WeakMap<Node, TrackingCtx>()

// ---- signal ----------------------------------------------------------

/**
 * Reactive value. Returns a `[get, set]` tuple that's also accessible
 * as `.get` / `.set` for destructure-skipping callers. Reads inside a
 * tracking context (node render, effect, memo) auto-subscribe; writes
 * notify every subscriber synchronously.
 *
 * ```ts
 * const [count, setCount] = signal(0)
 * setCount(1)               // value form
 * setCount((prev) => prev + 1)  // updater form
 * ```
 *
 * **Storing a function as a value — gotcha**: `set` interprets any
 * function argument as the *updater* form `(prev) => next`, calls it
 * with the current value, and stores the result. To store a function
 * value (e.g. a callable `StyleBuilder` or a handler ref), wrap with
 * the updater form so the call resolves to the function you wanted:
 *
 * ```ts
 * const [style, setStyle] = signal<StyleBuilder | undefined>(undefined)
 * setStyle(ctx.style)         // ✗ stored as `ctx.style(undefined)` — a string
 * setStyle(() => ctx.style)   // ✓ stored as the StyleBuilder itself
 * ```
 *
 * Same trap exists in Solid and React's `useState`. If you find
 * yourself reaching for it, also consider whether storing a *plain*
 * value (the underlying data, not the chain/builder) and recomputing
 * the function-y derivative inside a `memo` is cleaner — usually it
 * is.
 *
 * Equality is reference-based: `set(v)` where `v === current` skips
 * the notify. Wrap mutable values you want to "publish" in a fresh
 * object/array, or use a counter signal to force fan-out.
 */
export function signal<T>(initial: T): Signal<T> {
  let value = initial
  const subs = new Set<() => void>()

  const get = brand((): T => {
    const ctx = activeCtx.getStore()
    if (ctx && !subs.has(ctx.notify)) {
      subs.add(ctx.notify)
      ctx.register(() => subs.delete(ctx.notify))
    }
    return value
  }, "get") as Accessor<T>

  const set = brand((next: T | ((prev: T) => T)): void => {
    const resolved = typeof next === "function" ? (next as (prev: T) => T)(value) : next
    if (resolved === value) return
    value = resolved
    // Snapshot — subscribers may mutate the set while running.
    const snapshot = [...subs]
    for (const notify of snapshot) notify()
  }, "set") as Setter<T>

  return Object.assign([get, set] as const, { get, set }) as Signal<T>
}

/**
 * Lift a plain value to an `Accessor<T>`. The returned function always
 * returns `value`, never tracks, never notifies — useful at the boundary
 * where a static value enters a tree that otherwise expects `Accessor<T>`.
 *
 * Branded so `isAccessor` reports `true` and downstream `unwrap` calls
 * resolve to a stable function call rather than treating the value as
 * a ctx-aware thunk.
 *
 * ```ts
 * // Component expects `Accessor<Theme>` deep in the tree:
 * <CodeBlock theme={toAccessor(myStaticTheme)} />
 * ```
 */
export function toAccessor<T>(value: T): Accessor<T> {
  return brand(() => value, "get") as Accessor<T>
}

// ---- effect ----------------------------------------------------------

/**
 * Run `fn` immediately, then re-run whenever a signal it read writes.
 * Returns a disposer that stops the effect and drops all tracked
 * subscriptions. Unlike node render, effect dependencies are re-tracked
 * from scratch on every run — reads that disappear from `fn` stop
 * triggering re-runs.
 *
 * ```ts
 * const dispose = effect(() => {
 *   console.log("status is", status())
 * })
 * // ...
 * dispose()
 * ```
 *
 * **Footgun**: don't write a signal from inside an effect that reads
 * the same signal — you'll loop. Writing unrelated signals is fine.
 */
export function effect(fn: () => void): () => void {
  let cleanups: (() => void)[] = []
  let disposed = false

  // Capture the Owner at creation time. Re-fires triggered by signal
  // writes run in the *writer's* ALS context, which has nothing to do
  // with where the effect was created. Restoring the captured Owner on
  // each run keeps `useContext` walking the same ancestry regardless
  // of who triggered the re-fire.
  const owner = useActiveOwner()

  const ctx: TrackingCtx = {
    notify: () => {
      if (disposed) return
      run()
    },
    register: (cleanup) => {
      cleanups.push(cleanup)
    },
  }

  const run = (): void => {
    // Fresh deps each run — unsubscribe from everything we saw last time.
    const old = cleanups
    cleanups = []
    for (const c of old) c()
    const tracked = (): void => withTracking(ctx, fn)
    if (owner !== undefined) withOwner(owner, tracked)
    else tracked()
  }

  // Auto-dispose on owner teardown. If there's no owner, the caller
  // owns the returned dispose function and is responsible for cleanup.
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    for (const c of cleanups) c()
    cleanups = []
  }
  owner?.addCleanup(dispose)

  run()

  return dispose
}

// ---- memo ------------------------------------------------------------

/**
 * Derived, cached signal. `fn` runs once eagerly; the cached value is
 * returned from the accessor. When any signal `fn` reads writes, the
 * memo recomputes and notifies its own subscribers — but only if the
 * new value differs from the cached one (reference equality).
 *
 * ```ts
 * const [value, setValue] = signal(0)
 * const pct = memo(() => Math.round(value() * 100))
 * text(({ style }) => `${pct()}%`)   // subscribes to pct, not value
 * ```
 *
 * Returns an `Accessor<T>`, not a `[read, write]` tuple — memos are
 * read-only by construction.
 */
export function memo<T>(fn: () => T): Accessor<T> {
  const [get, set] = signal<T>(undefined as T)
  effect(() => {
    // Wrap in the updater form so `signal.set`'s `typeof === "function"`
    // detection always picks the outer closure, never `fn()`'s return
    // value. Without this, memoizing a callable `T` (e.g. a chainable
    // `StyleBuilder`) would cause `set` to invoke it as an updater and
    // cache the call result instead of the value itself.
    set(() => fn())
  })
  return get
}

// ---- async -----------------------------------------------------------

/**
 * Resource-style async accessor. `fn` reads signals (tracked); the
 * effect re-fires when any of them change. Each run registers its
 * in-flight promise on the calling node's tracker so a surrounding
 * drain (`Node.render({ async: false })`) awaits it before commit.
 *
 * Must be called inside `Node.render()` or `Node.setup()` — the
 * active node owns the async work for its lifetime. The node binding
 * is captured once at call time; effect re-fires re-register against
 * the same node regardless of where the scheduler runs them.
 *
 * ```ts
 * const highlighted = createAsync(
 *   async (prev) => highlight(unwrap(props.code)),
 *   { initialValue: unwrap(props.code) },
 * )
 * text(highlighted)
 * ```
 *
 * **`fn` should not reach for per-render data** (width, theme via
 * `RenderCtx`) — the async closure runs after the render returns and
 * re-fires outside any render. Use `createRenderEffect((ctx) => ...)`
 * to capture what you need (theme, style) into a signal at render time
 * and read that signal from `fn`.
 *
 * **Stale-write protection**: each run bumps a generation counter;
 * late `.then` callbacks check it and skip `setValue` if a newer run
 * has already fired.
 *
 * **`prev`** is the previously resolved value (or `initialValue`) —
 * useful for diff-based fetches. Reading it does *not* track, so
 * resolving the new value won't re-fire the effect.
 */
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  opts: { initialValue: T }
): Accessor<T>
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  opts?: { initialValue?: T }
): Accessor<T | undefined>
export function createAsync<T>(
  fn: (prev: T | undefined) => Promise<T>,
  opts?: { initialValue?: T }
): Accessor<T | undefined> {
  const [value, setValue] = signal<T | undefined>(opts?.initialValue)
  let gen = 0
  const node = useActiveNode()
  if (!node) throw new Error("createAsync must be called inside a Node.render()")
  effect(() => {
    const my = ++gen
    let p: Promise<T>
    try {
      p = fn(untrack(value))
    } catch (error) {
      // Sync throw inside `fn` — surface as a rejected promise so the
      // tracker registration / cleanup path stays uniform.
      p = Promise.reject(error as Error)
    }
    node.track(p)
    p.then(
      (v) => {
        if (my === gen) setValue(v)
      },
      () => {
        // Swallow — async failures leave the previous (or initial)
        // value in place.
      }
    )
  })
  return value
}
