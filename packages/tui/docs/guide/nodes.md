# Nodes & state

> TODO: expand this page.

Every widget is a `Node` with a state Proxy. Writes to `node.state.x = y` auto-invalidate the node; `setState({ ... })` batches a shallow patch.

```ts
const n = text({ content: "hello" })
n.state.content = "bye"   // auto re-renders
```

## Lifecycle

- `mount(ctx)` — called when attached to a surface; gets a `MountCtx` with scoped handles (input, overlay, actions, tree lookups).
- `unmount()` — called when detached. Use `node.on("unmount", fn)` for cleanup.

See [Reactivity](./reactivity) for the signal integration with `_render`.
