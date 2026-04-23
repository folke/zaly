# menu

A selectable list. Navigation + selection live on `this.actions` (same pattern as [`input`](./input)); the widget handles windowing, an optional `(n/total)` counter, and grow-only "sticky" heights so popups don't jitter while the user filters.

## Example

```ts
import { menu } from "@zaly/tui"

const m = menu({
  items: [
    { value: "/help", hint: "show commands" },
    { value: "/quit", hint: "exit" },
  ],
})
m.on("select", (item) => console.log("picked", item.value))
```

## Generic over item type

`Menu<T>` defaults to `MenuItem` (`{ value?, label?, hint? }` — all optional) but accepts any shape. Pair with a custom `render` for non-standard items:

```ts
interface Cmd { value: string; run: () => void }

menu<Cmd>({
  items: [{ value: "/quit", run: () => process.exit() }],
  render: (item, active, ctx) =>
    ctx.style.add(active ? "menuActive" : "menuLabel")(item.value),
}).on("select", (item) => item.run())   // fully typed, no cast
```

## State

| field         | type        | default | description |
|---------------|-------------|---------|-------------|
| `items`       | `Reactive<T[]>` | — | The list. Accepts a signal accessor so filtered results can drive the menu without manual `setState`. |
| `active`      | `number`    | `0`     | Highlighted index. Clamped to `[0, items.length-1]` on render. |
| `maxHeight`   | `number`    | items.length | Max item rows per paint. Counter (when shown) is extra. |
| `counter`     | `boolean \| undefined` | auto | `undefined` auto-shows when items exceed `maxHeight`. `false` forces off, `true` forces on. |
| `sticky`      | `boolean`   | `false` | When `true`, the rendered height can grow but never shrinks — prevents jitter in popups while the user types. |
| `width`       | `Size`      | `"fill"`| Render width. |
| `labelWidth`  | `number`    | widest label | Width of the label column (default layout only). |
| `render`      | `(item, active, ctx) => string` | — | Per-row renderer. When set, items don't have to be `MenuItem`-shaped. Menu clips/pads to width and still applies `menuActive` on the selected row. |

## Events

| event    | payload | when |
|----------|---------|------|
| `select` | `T`     | User picks the active item. |
| `cancel` | —       | User presses `esc` (`menu.cancel`). |

## Actions

| id | default keys | description |
|----|--------------|-------------|
| `menu.next` / `menu.prev` | `down` / `up`, `ctrl-n` / `ctrl-p` | Wrap at the ends. |
| `menu.first` / `menu.last` | `home` / `end` | |
| `menu.select` | `enter`, `tab` | Emit `select` with the active item. |
| `menu.cancel` | `esc` | Emit `cancel`. |

## Theming

- `menuLabel` — left column.
- `menuHint` — right column (hint / counter).
- `menuActive` — wraps the selected row. Always applied by Menu regardless of custom `render`, so selection visuals stay consistent across apps.

## Sticky + counter together

When `sticky: true`, the counter row is also sticky — once it appears, it keeps appearing even after filtering narrows the list. This preserves overall menu height AND gives a running `(filtered/total)` readout.

> [!TIP]
> Call `menu.resetHeight()` when the lifecycle owner (e.g. [`autocomplete`](./autocomplete) on close) wants the next open to start fresh.
