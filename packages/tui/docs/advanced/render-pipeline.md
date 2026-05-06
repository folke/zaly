# Render pipeline

A render "tick" turns the current node tree into bytes on the terminal, coalesced into one atomic frame. This page walks through it.

## One tick

```
invalidate → queueMicrotask → renderer.render() → terminal.sync(paints)
```

1. **Invalidate.** Any state mutation on a Node fires `this.invalidate()` (via the state proxy's setter). The node clears its render cache and, if it had one, cascades up to its parent. The topmost surface's `onDirty` fires.

2. **Coalesce.** Surface `onDirty` flips `renderer.#dirty = true` and schedules one `queueMicrotask`. Further invalidates within the same tick share the microtask — one render per tick regardless of how many state writes land.

3. **Render.** `renderer.render()` kicks off `Promise.all([stream, ui, overlay])`. Each surface returns rows; paints are captured (not executed) by a `capture(order)` shim so paint order stays explicit (`stream < ui < overlay`).

4. **Sync.** All captured paints run inside one `terminal.sync(() => ...)` block — a single `BEGIN_SYNC` / `END_SYNC` wrapping the entire frame.

## Per-node cache

Every Node caches its last-rendered rows, keyed by `ctx.version`:

```ts
if (this.#cache?.version !== ctx.version) {
  this.#cache = { rows: await this._render(ctx), version: ctx.version }
}
return this.#cache.rows
```

- `ctx.version` is a monotonic counter on the shared `RenderCtx`. Bumped by the Renderer on events that invalidate _every_ cache in the tree (resize, theme swap).
- Intra-tick invalidates clear `#cache` directly; next `render()` sees `undefined` and recomputes.
- `state.visible: false` also caches — the empty rows are stored with the current version so subsequent cascades see `hadCache === true` and propagate correctly. See [Invalidation](./invalidation).

## Width flows in, height emerges

`RenderCtx.width` is resolved by the parent before it calls `child.render(ctx)`. Children return however many rows they need. Heights aren't pre-declared — a Box asks each child to render at its inner width, then stacks what it gets back.

Column layout: children are rendered in parallel via `Promise.all`, each at the box's inner width. Row layout: `allocateRow(items, {contentWidth, gap})` computes per-child widths from `flexGrow` / `minWidth` / `maxWidth`, then children render at their allocated width.

## Scrollback semantics

Stream growth uses a deliberate `\n\r<clearLine><content>` pattern at `terminal.scrollBottom`:

- `\n` promotes the region's current top row into scrollback. This is the only portable way to do it — `CSI S` is ignored by xterm.js and ghostty-web's WASM parser.
- `\r` resets the column so the next payload starts at col 1.
- `clearLine()` wipes any trailing cells a shorter previous row might have left.
- `content` paints the new row.

When rows _change_ in the tracked region (state mutation on a still-live node), the stream surface rewrites them in place at their absolute position. Rows scrolling into scrollback during growth do so _after_ the in-place rewrites, so the new bytes land in history — not stale bytes.

## Further reading

- [Invalidation](./invalidation) — how the cascade works and why `hadCache` matters.
- [Direct-mode rendering](./direct-mode) — the bigger picture.
