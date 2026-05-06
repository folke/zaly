# Nodes & state

Every widget in `@zaly/tui` is a `Node`. Nodes have reactive state, a parent/child tree, a lifecycle, and a render hook — most of what you need to know about the framework boils down to understanding this base class.

## State

State is a shallow Proxy. Any `state.field = value` write auto-invalidates the node, which triggers a re-render on the next tick.

```ts
const t = text({ content: "hello" })
t.state.content = "bye" // re-renders next tick
```

Batched writes via `setState({...})`:

```ts
input.setState({ cursor: 0, value: "" }) // one invalidate, not two
```

> [!IMPORTANT]
> The proxy is _shallow_. Mutating a nested object or array in place (e.g. `state.padding[0] = 1`) does **not** invalidate. Reassign the whole field, or call `this.invalidate()` manually after the mutation.

## Lifecycle

Nodes emit four lifecycle events:

| event     | when                                            |
| --------- | ----------------------------------------------- |
| `mount`   | attached to a surface — `ctx` is now available. |
| `unmount` | detached. Clean up timers / subscriptions here. |
| `focus`   | became the focused node (input router).         |
| `blur`    | lost focus.                                     |

```ts
input({ placeholder: "type…" })
  .on("mount", () => console.log("attached"))
  .on("unmount", () => console.log("gone"))
```

## MountCtx

When a node mounts, it receives a `MountCtx` via `this.ctx`:

```ts
interface MountCtx {
  surface: "stream" | "ui" | "overlay"
  overlay: { open; close }
  input: { bind; focus; blur }
  actions: Actions // registry
  getNode(id): Node | undefined
  findNode(match): Node[]
}
```

This is the scoped handle into renderer services — widgets use it to open overlays, move focus, register actions, or look up other nodes by `id`. Undefined before mount and after unmount.

## Render

Subclasses implement `_render(ctx): string[] | Promise<string[]>`. The base class wraps it with caching:

```ts
class Hello extends Node<{ who: string }> {
  protected _render(ctx: RenderCtx): string[] {
    return [`hello, ${this.state.who}`]
  }
}
```

`ctx` carries the resolved theme, an ambient style builder (`ctx.style`), the target width, and a monotonic `version` used for cache invalidation on resize / theme swap. See [Render pipeline](../advanced/render-pipeline) for how ticks are composed.

> [!TIP]
> For one-off custom widgets, use the [`widget()` factory](../widgets/widget) instead of subclassing — it handles the state proxy, render wiring, and event emitter for you.

## The tree

Nodes form a parent / child tree via `add`, `remove`, `splice`, and `clear`:

```ts
const b = new Box({})
b.add(text("one"))
b.add(text("two"))
```

- `node.parent` — `undefined` for roots.
- `node.children` — readonly array.
- `splice(start, deleteCount, ...items)` — the full primitive.

Children already parented elsewhere are automatically detached from their old parent first. Adding a node to itself is rejected (would cycle on traversal).

## Ids, find, focus

```ts
input({}).id("composer").focus()
```

- `id()` / `id("name")` — read or set the node's id.
- `ctx.getNode("composer")` — find by id anywhere in the mounted tree.
- `ctx.findNode(match)` — string matches `node.type`; pass a function for richer predicates.
- `.focus()` / `.blur()` — move the router's focus. Deferred until mount when called pre-mount.

## See also

- [Reactivity](./reactivity) — signals that flow through state and subscribe nodes.
- [Invalidation](../advanced/invalidation) — the cache + cascade internals.
