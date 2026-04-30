# Reactivity

Solid-style fine-grained reactivity. Three primitives: `signal`, `memo`, `effect`. Any signal `get()` called inside a node's `_render` (or inside an effect / memo) auto-subscribes the caller; writes invalidate subscribers.

Cross-async tracking uses `AsyncLocalStorage`, so reads after an `await` still resolve to the right subscriber.

## signal

```ts
import { signal } from "@zaly/tui"

const [count, setCount] = signal(0)

setCount(1)              // direct write
setCount((n) => n + 1)   // functional write
```

## memo

Derived, cached signal.

```ts
import { memo, signal } from "@zaly/tui"

const [value, setValue] = signal(0)
const pct = memo(() => Math.round(value() * 100))

text(({ style }) => `${pct()}%`)   // subscribes to pct
```

## effect

Imperative side-effect that re-runs on dep change.

```ts
import { effect, signal } from "@zaly/tui"

const [status, setStatus] = signal("ready")

const dispose = effect(() => {
  console.log("status is", status())
})

// ...
dispose()
```

**Footgun**: don't write a signal from inside an effect that reads the same signal — infinite loop.

## untrack

`untrack(fn)` runs `fn` outside any tracking scope. Two reasons you'd want this:

1. **Read a signal without subscribing.** Inside a render or effect, calling an accessor normally subscribes the surrounding context. Wrapping in `untrack` reads the value but skips the subscription — useful when you want the current value but don't want a future write to retrigger the render/effect.
2. **Start persistent async work without inheriting the ALS context.** This is the more important use. A `setInterval`/`setTimeout`/`fetch` started during `_render` inherits the render's `AsyncLocalStorage` scope, so every callback fire looks like it's "inside" that render — and any `invalidate()` call from the callback is silently suppressed by the [invalidation discriminator](../advanced/invalidation#inrendercontextof--the-discriminator).

```ts
import { untrack } from "@zaly/tui"

// inside _render or a render-driven reconcile:
this.#timer = untrack(() => setInterval(() => this.invalidate(), 80))
```

The Spinner widget uses this for its frame interval. Equivalent to Solid's `untrack`.

## Reactive props

Most widget props accept either a literal or a signal accessor, typed `Reactive<T>`:

```ts
progress({ value: pct, visible: busy })   // both accessors
progress({ value: 0.5, visible: true })   // literals
```

Under the hood, widgets call `unwrap(state.value)` inside `_render`. The unwrap reads the accessor inside the tracking context, which registers the subscription.

Accessors are brand-tagged with a symbol, so widgets with function-valued props (like `text`'s callback content, or a label formatter) are never mistaken for reactive sources.
