# overlay

A [`box`](./box) that the overlay surface paints at an absolute position _after_ stream and UI have drawn. Never part of either surface's layout — rows go straight to the terminal at `(y, x)`.

## Example

```ts
import { overlay, text } from "@zaly/tui"

const modal = overlay(
  { x: 10, y: 4, border: "rounded", padding: 1, borderTitle: "Confirm" },
  text("Continue? (y/n)")
)

renderer.overlay.open(modal)
// ... later
renderer.overlay.close(modal)
// or from inside the widget:
modal.close()
```

## State

All [`box`](./box) fields plus:

| field    | type     | default | description                                 |
| -------- | -------- | ------- | ------------------------------------------- |
| `x`      | `number` | —       | Absolute column (1-based) of the left edge. |
| `y`      | `number` | —       | Absolute row (1-based) of the top edge.     |
| `zIndex` | `number` | `0`     | Higher paints on top.                       |

## Lifecycle

Open / close through the overlay surface:

```ts
renderer.overlay.open(modal)
renderer.overlay.close(modal)

// Or from within a mounted widget via its MountCtx:
widget.ctx?.overlay.open(modal)
widget.ctx?.overlay.close(modal)
```

## Notes

- The overlay surface re-emits the stream/UI rows it overwrote when an overlay closes, so covered content is restored without a full repaint.
- Rows covered by an overlay are marked stale so `\n`-at-scrollBottom scrolls don't leak overlay bytes into scrollback history.
- Because overlays paint after the scrolled region, they're safe to place over stream content without breaking scrollback integrity.

> [!TIP]
> For modal flows (confirm, picker) pair `overlay` with [`menu`](./menu) and wire focus transfer on open: `menu.focus()` in a `mount` listener. Restore focus on close via the MountCtx.
