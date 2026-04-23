# Surfaces

The renderer owns three independent surfaces, each with its own paint strategy. Widgets live on exactly one of them. Knowing which surface you're targeting is the single biggest decision shaping how your UI behaves.

## Stream

```ts
renderer.stream.append(markdown("**hello**"))
```

The scroll region. Grows downward — new content rides into the viewport via `\n` at `scrollBottom`, and older content slides into the terminal's own scrollback. Real scrollback: the user can scroll up, search, and copy-paste it as text.

- **Append-only from the outside.** The API is `stream.append(node)`; you don't place content anywhere, you emit it.
- **Live tail.** The last `maxLive` nodes (default `3`) remain reactive — mutating `state.content` on a live node re-renders in place. Older nodes freeze: their bytes remain on screen but their cache is never regenerated.
- **Best for:** agent responses, chat transcripts, log output, anything that's durable history.

## UI

```ts
renderer.ui.add(box({ padding: [0, 1] }, text("footer")))
```

Sticky footer, pinned at the bottom of the viewport via `DECSTBM` (set top/bottom margins). Auto-sizes to its content height (capped at `uiMaxHeight`, default one-third of the terminal rows).

- **Reflows on resize.** `SIGWINCH` bumps `ctx.version`, clears caches, and re-renders against the new width. `DECSTBM` is reissued for the new row count.
- **Single root Box.** `renderer.ui.add(child)` appends to a single column-layout root. Nest deeper with `box({ flexDirection: "row" }, ...)` as needed.
- **Best for:** input composer, status bar, progress indicators, anything that must stay visible while the stream keeps scrolling.

## Overlay

```ts
const panel = overlay({ x: 4, y: 2, border: "rounded" }, text("hi"))
renderer.overlay.open(panel)
// ... later
renderer.overlay.close(panel)
```

Absolute-positioned floating panels. Painted *after* stream + UI, at `(y, x)` via direct cursor moves.

- **Not part of scroll geometry.** Overlays never ride in `DECSTBM`; they just paint over whatever the other surfaces drew.
- **Scrollback safety.** Rows covered by an overlay are marked stale in the stream's mirror — when the stream next grows via `\n`-at-`scrollBottom`, it rewrites those rows first so overlay bytes don't leak into scrollback.
- **Closing repaints the uncovered cells.** The overlay surface remembers what was underneath and re-emits it, so you don't need a full tree re-render to clear a modal.
- **Best for:** confirm dialogs, command palettes, transient help, tooltips.

## Paint order

Per tick: `stream < ui < overlay`. Surfaces render in parallel via `Promise.all`, but their paint closures execute serially inside one `terminal.sync(...)` block — so later surfaces always land on top of earlier ones' bytes, atomically.

## See also

- [Direct-mode rendering](../advanced/direct-mode) — why the surfaces look like this.
- [Render pipeline](../advanced/render-pipeline) — the tick flow in detail.
