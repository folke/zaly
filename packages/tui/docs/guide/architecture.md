# Architecture

`@zaly/tui` is a direct-mode terminal UI toolkit. Instead of maintaining an in-memory screen buffer and diffing it against the terminal, it writes whole rows straight to stdout and lets the terminal's own scroll / scrollback do the rest.

## The renderer

A `Renderer` owns:

- A `Terminal` — writer + reader, handles DECSTBM, synchronized output, sigwinch.
- Three surfaces — `stream`, `ui`, `overlay`.
- An `InputRouter` + `Actions` registry — keyboard dispatch.
- A `Logger` — always-attached, routes `console.*`-style calls to the stream.

```ts
const renderer = createRenderer()
renderer.start()             // raw mode, DECSTBM, stdin listener
renderer.stream.append(…)    // content
renderer.ui.add(…)           // sticky footer
renderer.stop()              // cleanup
```

The renderer is the only public entry point that wires surfaces together. Everything else composes underneath.

## Surfaces

Each surface owns a region of the terminal and its own paint strategy:

- **Stream** — append-only, rides the scroll region, promotes into scrollback.
- **UI** — sticky footer, pinned by `DECSTBM`.
- **Overlay** — absolutely positioned, painted last.

See [Surfaces](./surfaces) for the full treatment.

## Ticks

A render "tick" coalesces all invalidates that land in one turn of the event loop into a single atomic paint:

```
state mutation → Node.invalidate → cascade to root
                                 → surface.onDirty
                                 → queueMicrotask
                                 → renderer.render()
                                 → terminal.sync(paints)
```

The microtask guarantees one paint per tick regardless of how many state writes happened. Inside the paint, surfaces render in parallel (`Promise.all`) but their paint closures run serially inside one synchronized-output block — so even terminals that show tearing on naive writes get an atomic frame.

See [Render pipeline](../advanced/render-pipeline) for the tick in detail.

## Nodes

Every visible thing is a `Node`. Nodes own:

- Reactive state (a shallow Proxy — any write auto-invalidates).
- A parent / child tree.
- A `_render(ctx)` hook returning rows.
- Lifecycle events (`mount` / `unmount` / `focus` / `blur`).
- Optional `actions` dict (named intents the router can dispatch to).

Custom widgets subclass `Node` or use the [`widget()` factory](../widgets/widget) for one-offs.

See [Nodes & state](./nodes).

## Reactivity

Solid-style fine-grained reactivity. `signal` / `memo` / `effect` feed state and auto-subscribe whichever node is currently rendering. No VDOM, no dependency array, no component re-execution — just recompute the read cell.

See [Reactivity](./reactivity).

## Directory layout

```
src/
  core/         Node, state proxy, reactivity, render ctx
  renderer/     Renderer, Terminal, Stream / UI / Overlay surfaces
  widgets/      all built-in widgets + autocomplete completion sources
  layout/       row / column allocation, border drawing, sizing
  style/        ANSI primitives, style builder, themes, shiki
  input/        InputRouter, Actions, key decoder, keymap
  logger/       Logger class, level definitions, inspect
  markdown/     renderMarkdown callbacks + pipeline (types, code, image, table)
  image/        Kitty / iTerm2 protocol + capability probe
  schemas/      generated JSON schemas (typia)
  runtime/      Bun / Node runtime shims (#runtime import map)
```

## Runtime split

Widgets use APIs that differ between Bun and Node — `Bun.markdown.render` vs `marked`, `Bun.stringWidth` vs `string-width`, etc. The `#runtime` import map in `package.json` resolves to `src/runtime/bun.ts` on Bun and `src/runtime/node.ts` on Node, keeping the rest of the codebase agnostic.

## See also

- [Direct-mode rendering](../advanced/direct-mode) — why the toolkit looks the way it does.
- [Render pipeline](../advanced/render-pipeline) — tick flow, caching, scrollback growth.
- [Invalidation](../advanced/invalidation) — cache + cascade internals.
