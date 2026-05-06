# widget

Factory for defining a custom widget from initial state and a render function. The go-to escape hatch when none of the built-ins fit — use it instead of subclassing `Node` for one-off compositions.

## Example

```ts
import { box, text, widget } from "@zaly/tui"

const statusLine = widget(
  { level: "success" as "success" | "warn" | "error", msg: "all systems nominal" },
  ({ ctx: { style }, state }) => text(`${style.bold[state.level](" ● ")} ${style.dim(state.msg)}`)
)

// Mutating state re-renders automatically.
statusLine.state.msg = "build failed"
statusLine.state.level = "error"
```

Return a single composed `Node` (usually a `box`) or an array for vertical stacking:

```ts
widget({}, () => [text("line one"), text("line two")])
```

## Signature

```ts
widget<S, E = BaseEvents>(
  initialState: S,
  render: (args: {
    state: S & BaseState
    ctx: RenderCtx
    emit: TypedEmitter<E>["emit"]
  }) => Node | (Node | false | null | undefined)[],
): Node<S & BaseState, E>
```

- `state` is a reactive proxy — writes auto-invalidate and re-render the widget.
- `ctx` is the live render context (theme, style builder, width).
- `emit` is pre-bound to the returned node, for custom events.

## Events

Whatever you declare in `E` plus `BaseEvents` (`mount` / `unmount` / `focus` / `blur` / `key` / `paste` / `invalidate` / `childadded` / `childremoved`).

```ts
type E = { changed: [value: number] }
const counter = widget<{ v: number }, E>({ v: 0 }, ({ state, emit }) => {
  emit("changed", state.v)
  return text(`v=${state.v}`)
})
counter.on("changed", (v) => console.log("now", v))
```

## Notes

- The returned node is a full `Node` instance — `id`, `focus`, `on`, `setState`, lifecycle hooks all work as usual.
- Falsy children in the array form are filtered out, enabling `state.show && text("...")`.

> [!TIP]
> For heavier stateful widgets (actions dict, async data, complex layout), subclass `Node` directly — `widget()` is for composition, not reinvention.
