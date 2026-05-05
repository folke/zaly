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
 * Solid-style context for sharing values down the render tree without
 * prop-drilling. The renderer publishes `RenderCtxContext` for every
 * `_render`; widgets can publish their own (theming overrides, focus
 * scope, drag state, plugin services) via `withContext`.
 *
 * ```ts
 * const ThemeOverride = createContext<Theme | undefined>(undefined)
 *
 * // provider:
 * withContext(ThemeOverride, customTheme, () => child.render(ctx))
 *
 * // consumer:
 * const theme = useContext(ThemeOverride) ?? defaultTheme
 * ```
 *
 * Implementation: a single ALS holds an immutable Map keyed by context
 * id; `withContext` creates a layered Map for its scope. Reads walk
 * the current Map; misses fall back to the context's default. Survives
 * `await` boundaries via the same ALS that powers tracking.
 */
export interface Context<T> {
  readonly id: symbol
  readonly defaultValue: T
}

const contextStore = new AsyncLocalStorage<Map<symbol, unknown>>()

export function createContext<T>(defaultValue: T): Context<T> {
  return { defaultValue, id: Symbol("@zaly/tui/context") }
}

/** Run `fn` with `ctx` set to `value`. Nested calls layer; the
 *  innermost wins for that id. */
export function withContext<T, R>(ctx: Context<T>, value: T, fn: () => R): R {
  const parent = contextStore.getStore()
  const next = new Map(parent)
  next.set(ctx.id, value)
  return contextStore.run(next, fn)
}

/** Read the current value of `ctx`. Returns the default when no
 *  ancestor `withContext` is in scope. */
export function useContext<T>(ctx: Context<T>): T {
  const map = contextStore.getStore()
  if (map === undefined) return ctx.defaultValue
  const v = map.get(ctx.id)
  return v === undefined ? ctx.defaultValue : (v as T)
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

// ---- Node integration ------------------------------------------------

/** Run `fn` as the `node`'s render pass. Signal reads inside subscribe
 *  the node; subscriptions auto-clear on unmount. Stale deps across
 *  renders persist until unmount — mildly wasteful (extra
 *  invalidations), but cheaper than re-tracking per render and
 *  harmless (invalidate is idempotent).
 *
 *  @internal */
export function withActiveNode<T>(node: Node, fn: () => T): T {
  // Lazy-create a stable per-node ctx: reusing the same `notify`
  // identity means multiple reads of the same signal dedupe in its
  // subscriber set.
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
  return withTracking(ctx, fn)
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
    withTracking(ctx, fn)
  }

  run()

  return () => {
    disposed = true
    for (const c of cleanups) c()
    cleanups = []
  }
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
    set(fn())
  })
  return get
}

// ---- async -----------------------------------------------------------

/**
 * A drain-able set of in-flight promises. Producers (`createAsync`,
 * Node classes that await directly) `add` their promise, `delete` it
 * on settle. Consumers (stream surface, `Suspense`) await everything
 * in the set and re-render until the set is stable.
 *
 * Threaded through the render tree via `AsyncTrackerContext`.
 */
export type AsyncTracker = Set<Promise<unknown>>

/**
 * Render-scope handle to the active drain target. Surfaces / Suspense
 * boundaries install one via `withContext`; producers register their
 * pending work with whatever's innermost.
 *
 * Consumer pattern (Node class):
 * ```ts
 * const tracker = useContext(AsyncTrackerContext)
 * const p = doAsyncWork()
 * tracker?.add(p)
 * try { return await p } finally { tracker?.delete(p) }
 * ```
 *
 * Producer pattern (widget): use `createAsync` — handles registration,
 * stale-write protection, and signal-driven re-fire.
 */
export const AsyncTrackerContext = createContext<AsyncTracker | undefined>(undefined)

/**
 * Solid-style async accessor. Runs `fn` inside an `effect` so signal
 * reads inside it auto-track and re-fire the work when sources change.
 * Each run registers its promise with the active `AsyncTrackerContext`,
 * so stream surfaces can drain pending work before commit and Suspense
 * boundaries can decide on a fallback.
 *
 * Returns an `Accessor<T | undefined>`. Reads inside a render / effect
 * subscribe normally — the value updates from `initialValue` to the
 * resolved value once the promise settles.
 *
 * ```ts
 * const highlighted = createAsync(
 *   async () => highlight(unwrap(props.code)),
 *   { initialValue: unwrap(props.code) },
 * )
 * text(highlighted)
 * ```
 *
 * **Stale-write protection**: each effect run bumps a generation
 * counter; late `.then` callbacks check it and skip the `setValue`
 * if a newer run has already fired. Without this, fast-changing
 * sources would race their highlight results.
 *
 * **Tracker registration**: `useContext(AsyncTrackerContext)` is read
 * inside the effect, so the active tracker at the time the effect
 * runs is the one registered with. For widget bodies that defer to
 * `_render` (the standard `widget()` factory), this picks up the
 * surface's or Suspense boundary's tracker correctly.
 */
export function createAsync<T>(
  fn: () => Promise<T>,
  opts: { initialValue: T }
): Accessor<T>
export function createAsync<T>(
  fn: () => Promise<T>,
  opts?: { initialValue?: T }
): Accessor<T | undefined>
export function createAsync<T>(
  fn: () => Promise<T>,
  opts?: { initialValue?: T }
): Accessor<T | undefined> {
  const [value, setValue] = signal<T | undefined>(opts?.initialValue)
  let gen = 0
  effect(() => {
    const my = ++gen
    const tracker = useContext(AsyncTrackerContext)
    let p: Promise<T>
    try {
      p = fn()
    } catch (error) {
      // Sync throw inside `fn` — surface as a rejected promise so the
      // tracker registration / cleanup path stays uniform with async
      // failures, and so callers can still observe the failure.
      p = Promise.reject(error as Error)
    }
    tracker?.add(p)
    p.then(
      (v) => {
        if (my === gen) setValue(v)
      },
      () => {
        // Swallow — async failures leave the previous (or initial)
        // value in place. Producers that want richer error UX should
        // model errors in `T` (e.g. `T = Result<Highlighted, Error>`).
      }
    ).finally(() => {
      tracker?.delete(p)
    })
  })
  return value
}
