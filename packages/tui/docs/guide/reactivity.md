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

## Reactive props

Most widget props accept either a literal or a signal accessor, typed `Reactive<T>`:

```ts
progress({ value: pct, visible: busy })   // both accessors
progress({ value: 0.5, visible: true })   // literals
```

Under the hood, widgets call `unwrap(state.value)` inside `_render`. The unwrap reads the accessor inside the tracking context, which registers the subscription.

Accessors are brand-tagged with a symbol, so widgets with function-valued props (like `text`'s callback content, or a label formatter) are never mistaken for reactive sources.
