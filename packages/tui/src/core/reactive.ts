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

const activeCtx = new AsyncLocalStorage<TrackingCtx>()

function withTracking<T>(ctx: TrackingCtx, fn: () => T): T {
  return activeCtx.run(ctx, fn)
}

// ---- public types ----------------------------------------------------

/** Brand tag: every accessor / setter returned by `signal` / `memo`
 *  carries this symbol so `unwrap` can tell a reactive source from a
 *  plain function-valued prop (label formatter, text callback, etc.). */
const REACTIVE = Symbol.for("@zaly/tui/reactive")

export type Signal<T> = readonly [get: Accessor<T>, set: Setter<T>]

/** A read-only reactive source. Branded so `isAccessor` can detect it
 *  without false positives on arbitrary callables. */
export type Accessor<T> = (() => T) & { readonly [REACTIVE]: "get" }

/** A signal setter. Same branding as `Accessor` (different tag) so a
 *  setter isn't mistaken for an accessor by `unwrap`. */
export type Setter<T> = ((next: T | ((prev: T) => T)) => void) & { readonly [REACTIVE]: "set" }

/** A widget prop that's either a literal value or a reactive accessor. */
export type Reactive<T> = T | Accessor<T>

/** Runtime check: `true` when `v` was produced by `signal` / `memo`.
 *  False for plain callables (text-content functions, label formatters). */
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
  Object.defineProperty(fn, REACTIVE, { configurable: false, enumerable: false, value: tag, writable: false })
  return fn
}

// ---- Node integration ------------------------------------------------

/** Run `fn` as the `node`'s render pass. Signal reads inside subscribe
 *  the node; subscriptions auto-clear on unmount. Stale deps across
 *  renders persist until unmount — mildly wasteful (extra
 *  invalidations), but cheaper than re-tracking per render and
 *  harmless (invalidate is idempotent). */
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

  return [get, set] as const
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
