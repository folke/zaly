# Invalidation

Every Node has cache + invalidate machinery. Understanding it is useful when writing a custom widget, and essential when debugging a "why isn't this re-rendering" or "why is this re-rendering forever" bug.

## The cache

```ts
#cache?: { rows: string[]; version: number }
#invalidations = 0
```

`#cache` is set after `_render` completes (when the render's rows are valid). Reused on subsequent `render(ctx)` calls when `ctx.version === #cache.version`.

`#invalidations` is a monotonic counter — bumped on every external invalidate, captured at the start of a render, and re-checked after `_render` resolves. If it moved during the render, the rows we just produced are stale (an external mutation landed mid-render), so the cache writeback is **skipped** and the next paint runs a fresh `_render` against the latest state.

## The cascade

```ts
invalidate(): this {
  this.#cache = undefined
  if (inRenderContextOf(this)) return this
  this.#invalidations++
  this.emit("invalidate")
  this.parent?.invalidate()
  return this
}
```

State proxies call `invalidate()` on every mutation. The node:

1. Clears the cache.
2. Checks `inRenderContextOf(this)` — short-circuits when the invalidate originates _inside this node's own render call stack_ (see below).
3. Otherwise, bumps `#invalidations`, emits `"invalidate"`, and **always** cascades to the parent. Surfaces dedupe via their own `scheduled` flag, so the per-invalidate cost is one tree walk + emit — cheap enough that the cascade never short-circuits based on cache state.

The surface at the top of the tree catches `"invalidate"` on its root and schedules a repaint.

## `inRenderContextOf` — the discriminator

```ts
export function inRenderContextOf(node: Node): boolean {
  const active = activeCtx.getStore() // ALS lookup
  return active !== undefined && active === nodeCtx.get(node)
}
```

`withActiveNode(node, fn)` runs `fn` with `node`'s tracking ctx as the active `AsyncLocalStorage` store. Awaits inside `fn` keep that ctx; _other_ async work doesn't see it. So `inRenderContextOf(this)` answers a single question: **"is this `invalidate` call part of the in-flight render's own logic?"** Four cases:

| call site                                                                   | ALS scope at call | `inRenderContextOf(this)` | behavior                                                                          |
| --------------------------------------------------------------------------- | ----------------- | ------------------------- | --------------------------------------------------------------------------------- |
| `this.invalidate()` from inside `this._render`                              | `this`'s ctx      | `true`                    | self-mutation; render reflects it. **Suppress.**                                  |
| Child `setState` from inside parent's `_render`, cascading up to parent     | parent's ctx      | `true` for parent         | parent will call `child.render` next; rows reflect new state. **Suppress.**       |
| Child's own `_render` mutates something cascading up to parent              | child's ctx       | `false` for parent        | parent's running render is based on pre-mutation tree. **Emit + cascade + bump.** |
| External callback (network, timer, key event) mutates state during a render | `undefined`       | `false`                   | external; must repaint. **Emit + cascade + bump.**                                |

The first two cases produce rows that _do_ reflect the new state — the cache writeback is valid, and we don't want a redundant repaint. The last two need the generation-mismatch check to skip the writeback so the next render sees a cache miss.

This is what powers the Markdown→Text and Input→Text patterns: the parent mutates its child Text's state inside its own `_render` and then calls `text.render(ctx)` to get fresh rows. The cascade reaches the parent (it's nested inside `withActiveNode(parent)`), and the suppression ensures the parent doesn't schedule a redundant follow-up paint.

## Async work started during `_render` — use `untrack`

If you start a `setInterval`, `setTimeout`, or any persistent async work _from inside_ `_render` (or any code reachable from `_render`), the async callback **inherits the render's ALS context**. Every fire of that timer/promise then looks like it's "inside" the render — and `invalidate` calls from inside the callback are silently suppressed.

The Spinner widget hits this: its `#startTimer` is reachable from `_render` via the `running: false → true` reconcile path. Without escaping the ALS scope, the interval would be set up under `withActiveNode(spinner)`, every tick would run with `activeCtx === spinner`'s ctx, `inRenderContextOf(spinner) === true` → invalidate suppressed → spinner never re-renders.

The fix is `untrack`:

```ts
import { untrack } from "@zaly/tui"

#startTimer(): void {
  this.#timer = untrack(() => setInterval(() => this.invalidate(), this.speed))
}
```

`untrack(fn)` runs `fn` with the ALS store cleared. Async work started inside captures _no_ context. Equivalent to Solid's `untrack`. See [Reactivity → untrack](../guide/reactivity#untrack).

## Visible: false caches too

A `state.visible: false` render returns `[]` early, but **still populates** `#cache`:

```ts
if (!unwrap(this.state.visible ?? true)) {
  this.#cache = { rows: [], version: ctx.version }
  return this.#cache.rows
}
```

Caching the empty result keeps the cache invariant intact across visibility flips, so a later flip-to-visible invalidate produces a cache miss and a real render rather than serving the empty rows back.

## Custom widget checklist

When building a widget by subclassing `Node`:

- **Writes to `this.state.*` auto-invalidate** via the proxy. No manual calls needed.
- **`this.setState({...})`** is the batched form — writes all keys then invalidates once.
- **Writing state inside `_render` is allowed** — Markdown→Text and Input→Text rely on it. The ALS-based discriminator handles it correctly. But avoid it when an `effect`-driven reconcile or a pre-compute would do; explicit dependencies are easier to reason about.
- **`this.invalidate()` manually** is fine for derived / computed changes the proxy can't see (e.g. mutating a nested object — the shallow proxy doesn't trap nested writes).
- **Wrap `setInterval` / `setTimeout` / persistent async work in `untrack(...)`** if the setup site is reachable from `_render`. Otherwise the callback inherits the render's ALS scope and its invalidates get swallowed.

## Debugging

- **"Why isn't it re-rendering?"** First check whether the invalidate site is inside an ALS-tracked render. A timer/interval set up inside `_render` (without `untrack`) is the usual culprit — `inRenderContextOf` returns `true` for every fire and silently suppresses.
- **"Why is it re-rendering forever?"** Check for state writes inside `_render` that mutate a _non-child_ node, or for an `effect` that writes the same signal it reads. The cascade is now unconditional, so a stray write produces a real loop.
- **Subscribe to `"invalidate"`** on a node for ad-hoc tracing — it's just an emitter event. Counting events on each tick is a fast way to find runaway invalidates.
