# Direct-mode rendering

`@zaly/tui` is a _direct-mode_ terminal UI toolkit — it writes whole rows straight to stdout instead of maintaining a virtual screen buffer. No double-buffer, no diff-per-cell, no terminal emulator abstraction. The terminal's own scrollback keeps the history.

This page explains what that means in practice and why the toolkit is shaped the way it is.

## The three surfaces

A rendered frame lands on one of three surfaces, each with its own paint strategy.

### Stream (`renderer.stream`)

The scroll region. Growth emits `\n` at `scrollBottom` — the only portable way to promote a row into scrollback (xterm.js, ghostty-web, real terminals). Append-only from the outside, so the API is a simple `stream.append(node)`.

Internally the Stream keeps the last `maxLive` appended nodes reactive — mutating their state re-renders in place at the tail. Older nodes freeze once they leave the live window.

### UI (`renderer.ui`)

Sticky footer. Pinned at the bottom of the viewport via `DECSTBM` (set top / bottom margins). The UI auto-sizes to its content height (capped at `uiMaxHeight`, default `rows / 3`). When the height changes:

- **Grow**: scroll the existing scroll region up first (so stream content slides into scrollback), then `DECSTBM` resizes.
- **Shrink**: `DECSTBM` resizes first, then scroll the now-larger region down so bottom-anchored content stays put.

### Overlay (`renderer.overlay`)

Absolute-positioned floating panels. Painted _after_ stream + UI, at `(y, x)` via direct cursor moves. Rows covered by an overlay are marked stale so stream growth doesn't leak overlay bytes into scrollback.

## Why direct mode

- **The terminal already has a great virtual screen buffer.** Writing another one on top of it means you're fighting for control of the same bytes.
- **Scrollback integrity.** Content that's flowed through `\n`-at-`scrollBottom` is _actually_ in scrollback — the user can scroll up, search, copy it as text.
- **Low cost for short-lived frames.** No frame loop, no cell diff, no scene graph. A render tick is "compute rows, write the changed ones."
- **Cheap to reason about.** Every visible cell maps 1:1 to a byte you wrote. Bugs reduce to "look at the bytes".

## Synchronized output

Per-flush flicker is hidden via `CSI ? 2026` (synchronized updates) when supported. One `terminal.sync(() => { ... })` per tick wraps all writes in `BEGIN_SYNC` / `END_SYNC`, so the terminal commits the whole frame atomically. On terminals that don't support it, the writes just happen — tearing is minimal because direct mode does so few writes per tick.

## APC escapes

Image transmits (Kitty KGP) and zero-width metadata ride on `ESC _ ... ESC \` (APC) escapes. These are _side-channel_ bytes — the terminal consumes them silently. `stringWidth`, `sliceAnsi`, and `wrapAnsi` in `src/style/ansi.ts` extract APCs before measuring and re-prepend them to the output, so layout math isn't fooled into counting image bytes as cell width.

## Further reading

- [Render pipeline](./render-pipeline) — how a render tick flows through surfaces.
- [Invalidation](./invalidation) — the per-node cache + cascade that drives re-renders.
