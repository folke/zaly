# Surfaces

> TODO: expand this page.

Three surfaces, each serving a specific rendering need.

## Stream

The scroll region. Content appended here grows upward into the terminal's own scrollback — no reinvention required. Best for durable history: agent output, logs, chat transcripts.

```ts
renderer.stream.append(markdown("**hello**"))
```

## UI

Sticky footer, pinned at the bottom via `DECSTBM`. Typically holds the input composer, status line, progress indicator.

```ts
renderer.ui.add(box({ padding: [0, 1] }, text("footer")))
```

## Overlay

Absolute-positioned floating panels. Painted after stream+ui; covered rows are marked stale so scroll doesn't leak overlay bytes into history.

```ts
const panel = overlay({ x: 4, y: 2, border: "rounded" }, text("hi"))
renderer.overlay.open(panel)
```
