# Invalidation

Every Node has a small amount of cache + invalidate machinery. Understanding it is useful when writing a custom widget, and essential when debugging a "why isn't this re-rendering" bug.

## The cache

```ts
#cache?: { rows: string[]; version: number }
```

Set after `_render` completes. Reused on subsequent `render(ctx)` calls when `ctx.version === #cache.version`.

## The cascade

```ts
invalidate(): this {
  const hadCache = this.#cache !== undefined
  this.#cache = undefined
  if (this.#rendering) return this
  this.emit("invalidate")
  if (hadCache) this.parent?.invalidate()
  return this
}
```

State proxies call `invalidate()` on every mutation. The node:

1. Notes whether it had a cached result.
2. Clears the cache.
3. Emits `"invalidate"` (surfaces / effects subscribe here).
4. Cascades to the parent **only if `hadCache`** — an optimization that avoids redundant ancestor walks when back-to-back writes land on a freshly invalidated node.

The surface at the top of the tree catches `"invalidate"` on its root and schedules a repaint.

## The `#rendering` guard

`render()` sets `#rendering = <promise>` while a render is in flight and clears it in `finally`. The guard on `invalidate()` exists so that *intentional* mid-render mutations don't cascade:

- [`markdown`](../widgets/markdown) calls `this.#text.setState({...})` inside `_render` to hand updated content to its Text child.
- [`input`](../widgets/input) does the same with its Text child.

In both cases the current render already produces output that reflects the new state — cascading would schedule a redundant re-paint. The guard drops the cascade cleanly.

## Visible: false caches too

A `state.visible: false` render returns `[]` early, but **still populates** `#cache`:

```ts
if (!unwrap(this.state.visible ?? true)) {
  this.#cache = { rows: [], version: ctx.version }
  return this.#cache.rows
}
```

Why: without this, a toggleable panel's first render-while-hidden would leave `#cache` undefined. A later flip-to-visible invalidate would check `hadCache` → `false` → no cascade to parent. The root surface would never get dirty and the panel wouldn't appear.

Caching the empty result makes the invariant "a rendered node has a cache" hold regardless of visibility, so the cascade always propagates correctly.

## Custom widget checklist

When building a widget by subclassing `Node`:

- **Writes to `this.state.*` auto-invalidate.** No manual calls needed.
- **`this.setState({...})`** is the batched form — writes all keys then invalidates once.
- **Never write state inside `_render`** if you can avoid it — use a parent-level effect, or pre-compute. The exceptions are legitimate child setup (Markdown → Text, Input → Text), and those rely on the `#rendering` guard to avoid feedback loops.
- **`this.invalidate()` manually** is fine for derived / computed changes the proxy can't see (e.g. mutating a nested object, which the shallow proxy doesn't trap).

## Effects and signals

[Reactivity](../guide/reactivity) sits on top of the same machinery. An `effect(fn)` subscribes to the signals read during its run. When a signal writes, it calls `invalidate()` on every subscribed effect, which re-runs `fn`. Signals passed into state (`state.value = signalAccessor`) are unwrapped inside the active rendering context, so the node becomes a subscriber and re-renders on signal change.

## Debugging

- "Why isn't it re-rendering?" Start by checking `hadCache`. If the node's cache is `undefined` when invalidate fires, the cascade stops. The visible-false path is the usual culprit (see above).
- "Why is it re-rendering extra?" A `this.state.*` write inside `_render` with the `#rendering` guard relaxed would do it. Also check for effect subscriptions that read state they shouldn't.
- Subscribe to `"invalidate"` on a node for ad-hoc tracing — it's just an emitter event.
