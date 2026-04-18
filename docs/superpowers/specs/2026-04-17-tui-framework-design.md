# @zaly/tui — Lightweight Direct-Mode TUI Framework

**Status:** design / pre-implementation
**Date:** 2026-04-17
**Package:** `@zaly/tui` (`packages/tui`)
**Consumer:** Zaly agent harness

## 1. Motivation & Goals

`@zaly/tui` is the UI layer for the Zaly agent harness. Unlike most TUI libraries
(blessed, ink, opentui, ratatui), it is a **direct-mode renderer**: terminal
scrollback is preserved so the user can scroll up through the entire session
after it ends. The framework writes append-mostly output to the scrollback and
maintains a small persistent region at the bottom for interactive chrome.

### Goals

- **Direct-mode rendering.** Native terminal scrollback is always available;
  the framework never takes over the alternate screen buffer during normal
  operation.
- **Small surface.** Minimal public API. One primitive (`node`), a few
  built-ins (`box`, `text`, `input`), three surfaces (`stream`, `ui`,
  `overlay`).
- **Pure TS/JS.** No native code. `bun`/`node` parity via a thin `#runtime`
  indirection. Bun's fast-path utilities are used automatically when running
  on Bun.
- **Composable, imperative API.** No JSX, no reconciler, no tagged-template
  sugar. Factory functions returning mutable node handles.
- **Typed top-to-bottom.** Generic `Node<S, E>` carries both state shape and
  event map. State mutation is type-checked; event listeners are type-checked.

### Non-goals (v1)

- Alternate-screen full-app mode. Out of scope.
- React/Solid/Vue bindings. Not needed for the harness.
- A virtual DOM or keyed reconciliation.
- CSS-complete flexbox. We implement a deliberate subset (see §9).
- Fine-grained signal-based reactivity. Dirty tracking is coarse (per-node cache).
- Rich animation support (beyond what a simple render loop gives you).

---

## 2. Architectural Overview

The framework exposes **three surfaces** on top of a shared node/render model:

| Surface   | Purpose                                      | Enters scrollback? | Redraw model                                   |
| --------- | -------------------------------------------- | ------------------ | ---------------------------------------------- |
| `stream`  | Append log: messages, tool calls, output     | Yes (auto-commit)  | Live tail, partial commits when it overflows   |
| `ui`      | Fixed chrome at the bottom: input, status    | No                 | Row-diff redraw, in-place rewrites             |
| `overlay` | Modal / floating window (optional)           | No                 | Full viewport buffered compositing, z-index    |

During normal operation only `stream` and `ui` are active. Opening an overlay
switches rendering into a buffered compositing mode; closing it restores the
direct-mode pipeline.

### Terminal scroll region

The renderer uses `DECSTBM` (`\x1b[<top>;<bottom>r`) to reserve the bottom
rows for the `ui` surface. The stream area scrolls naturally within the region
above. This keeps the footer sticky without manual cursor math on every write.

---

## 3. The Stream Lifecycle

The `stream` surface holds an ordered list of **nodes**. At any time it has
one **live tail** — the most recently appended node. All other nodes are
**committed**: their output has been written to terminal scrollback and is
no longer tracked by the framework.

```
stream.append(node)
  ├─ previous tail (if any) → commit
  └─ new node becomes the live tail
```

### State transitions

```
┌────────────┐   new node appended   ┌───────────┐
│ live-tail  │ ────────────────────► │ committed │  (terminal scrollback)
└────────────┘                       └───────────┘
       ▲
       │ stream.append(node)
```

A node has exactly two logical states: **live-tail** or **committed**. No
explicit `settle()`/`commit()` step is needed. Appending a new node
auto-commits the previous tail.

### Partial commit (large live node)

If the live tail's rendered output exceeds the live region height
(`viewportHeight - uiHeight`), its **oldest rows** are force-written to
scrollback and the framework only tracks the still-visible portion for
re-renders. The node itself remains logically live — future re-renders still
happen — but the rows that scrolled off are frozen forever.

This allows a 500-line streaming code block to render correctly in a 40-row
terminal: the head spills into scrollback as it grows, the tail keeps
re-rendering (allowing line-by-line syntax highlighting to stabilize), and
when the block completes the final tail state is committed.

### Concurrency

The stream is strictly **sequential**: you cannot have two concurrent live
nodes as direct children of `stream`. If a feature needs concurrent rendering
(e.g., two parallel tool calls), it must live inside a single composite node
that is the current tail. The composite is responsible for its children's
internal state; it becomes committable the moment a new node is appended
after it.

---

## 4. Render Contract

Every node renders to **rows of pre-styled ANSI strings**:

```ts
type Rows = string[]

interface RenderCtx {
  width: number          // available cells
  theme: Theme           // ambient style config
}
```

Each entry in `Rows` is exactly one row of terminal output, with ANSI escape
sequences already applied. No trailing newlines. No embedded `\n` within an
entry. Rows are the commit/diff unit throughout the framework.

### Why ANSI strings, not structured spans or cell grids

- **Zero integration cost with shiki/marked-terminal/chalk.** Those libraries
  emit ANSI-styled strings directly; we pass them through.
- **Cheap to serialize for commit.** A committed row is literally
  `stdout.write(row + '\n')`.
- **Cheap to diff.** String equality is fast and sufficient at row granularity.
- **No custom data type to learn.** `string[]` is obvious.

### The one gotcha: `\x1b[0m` and parent backgrounds

When a Box has a non-default background and wraps children that emit `\x1b[0m`
(full reset), the reset clobbers the parent's bg for the rest of that row.
The Box's render post-processes child rows by replacing `\x1b[0m` with
`\x1b[0m<reapply-bg>`. This runs only when a bg is actually set, so the cost
is proportional to how many bg-styled subtrees exist.

### Node render signature

```ts
interface Node<S extends object = object, E extends Events = BaseEvents> {
  render(ctx: RenderCtx): Rows
  // ...see §6
}
```

Nodes do **not** receive absolute coordinates. Width flows in via `ctx.width`;
height emerges from the returned row count.

---

## 5. `#runtime` Abstraction

The framework targets Bun and Node. Runtime-specific code lives in a single
module imported as `#runtime` (already wired in `packages/tui/package.json`):

```json
"imports": {
  "#runtime": {
    "bun": "./src/runtime.bun.ts",
    "default": "./src/runtime.node.ts"
  }
}
```

The two implementations export the same interface:

```ts
// src/runtime.*.ts
export function stringWidth(s: string): number
export function slice(s: string, start: number, end?: number): string
export function wrap(s: string, width: number, opts?: WrapOpts): string[]
export function truncate(s: string, width: number, ellipsis?: string): string
export function strip(s: string): string                // remove ANSI
export function splitRows(s: string): string[]          // split on \n, ANSI-safe

export interface WrapOpts { mode: 'word' | 'char' }
```

- `runtime.bun.ts` uses `Bun.stringWidth` and Bun-optimized string ops.
- `runtime.node.ts` uses the corresponding npm packages (`string-width`,
  `slice-ansi`, `wrap-ansi`, `cli-truncate`, `strip-ansi`).

All other framework code imports these primitives from `#runtime` and never
touches platform-specific APIs directly. Shipping Zaly as a Bun single-file
binary does not require any framework changes.

### 5.1 Minimal `Theme`

`RenderCtx.theme` is passed to every `render` call. v1 ships a minimal shape;
consumers can extend via module augmentation.

```ts
interface Theme {
  colors: {
    fg:      Color; bg:      Color
    muted:   Color; dim:     Color
    primary: Color; accent:  Color
    ok:      Color; warn:    Color; err: Color
  }
  borders?: Record<string, BorderChars>  // named presets for `border: 'name'`
}

interface RenderCtx {
  width: number
  theme: Theme
}
```

A built-in `defaultTheme` is exported from the package root.

---

## 6. Node Model

### 6.1 Core types

```ts
type Events = Record<string, unknown[]>

interface TypedEmitter<T extends Events> {
  on<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this
  off<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this
  once<K extends keyof T>(event: K, fn: (...args: T[K]) => void): this
  emit<K extends keyof T>(event: K, ...args: T[K]): boolean
}

type BaseEvents = {
  invalidate: []                 // state changed, cache is stale
  mount:      []                 // attached to an active tree
  unmount:    []                 // detached
}

interface Node<S extends object = object, E extends Events = BaseEvents>
  extends TypedEmitter<E>
{
  readonly __node: true
  state: S                                          // Proxy-wrapped
  setState(patch: Partial<S>): this                 // batch update
  invalidate(): this
  render(ctx: RenderCtx): string[]
  parent: Node | null
}
```

### 6.2 State as Proxy

`state` is a `Proxy` over the underlying object. Setting any property:

1. Compares the new value with the old. Returns early if equal.
2. Writes to the backing object.
3. Calls `this.invalidate()`.

```ts
text.state.content = 'hello'      // ← auto-invalidates, next frame re-renders
box.state.border  = 'rounded'     // ← auto-invalidates
box.state.fg      = 'cyan'        // ← auto-invalidates
```

**Caveat (document clearly):** the proxy is shallow. `box.state.padding = [1, 2]`
works. `box.state.padding[0] = 3` does **not** invalidate — the inner array
is not proxied. Reassign fields rather than mutating through them. This is
acceptable because all public state fields are primitives or short
tuples/strings.

For batch updates (multiple fields → single invalidation):

```ts
box.setState({ border: 'rounded', title: 'tool: read_file', fg: 'cyan' })
```

### 6.3 Events

Events are per-node typed. Each built-in node type declares its own event map:

```ts
type BoxEvents   = BaseEvents & { childadded: [Node]; childremoved: [Node] }

type InputEvents = BaseEvents & {
  focus:  []
  blur:   []
  input:  [value: string]
  submit: [value: string]
  key:    [ev: KeyEvent]
}
```

The framework uses a **small in-house typed emitter** (~40 lines) rather than
inheriting from Node.js `EventEmitter`, for bun/node parity and to avoid the
historical baggage of `EventEmitter`.

Events are **not bubbling** by default. Each emitter is self-contained.
Input-specific bubbling (parent handling unhandled keys from focused child)
is implemented as a targeted mechanism in the input-routing layer, not a
general emitter feature.

### 6.4 Built-in node types (v1 core)

```ts
interface Text extends Node<TextStyle, BaseEvents> {}

interface Box extends Node<BoxStyle, BoxEvents> {
  readonly children: ReadonlyArray<Node>
  add(child: Node): this
  remove(child: Node): this
  clear(): this
}
```

`Input` is specified separately in the follow-up input spec (§11); its
`InputEvents` shape shown in §6.3 is illustrative only.

Methods like `box.add(child)` that are not state mutations remain real methods
on the class; they manage parent/child relationships and emit `childadded` /
`childremoved`.

### 6.5 Custom nodes

A single primitive covers all user-defined node types:

```ts
function node<S extends object, E extends Events = BaseEvents>(
  initialState: S,
  render: (args: {
    state: S
    ctx:   RenderCtx
    emit:  TypedEmitter<E>['emit']
  }) => Node | (Node | false | null | undefined)[],
): Node<S, E>
```

`initialState` drives generic inference of `S`; `setState` is therefore
type-safe (`Partial<S>`). The render function may return either another Node
(composition — common case) or an array of Rows/Nodes.

Example — streaming tool call:

```ts
const toolCall = node(
  { name: '', status: 'running' as 'running' | 'done', output: '' },
  ({ state }) => box(
    { border: 'rounded', title: `tool: ${state.name}`, padding: 1 },
    text(state.status === 'running' ? '⟳ running…' : '✓ done', {
      fg: state.status === 'running' ? 'yellow' : 'green',
    }),
    state.output && text(state.output, { fg: 'dim' }),
  ),
)

toolCall.state.status = 'done'                               // auto re-render
toolCall.setState({ status: 'done', output: '42 lines' })    // batch alternative
```

---

## 7. Cache & Dirty Tracking

### 7.1 Per-node cache

```ts
class NodeBase<S> extends Emitter {
  protected cache: string[] | null = null   // null = dirty

  invalidate(): this {
    if (this.cache === null) return this    // short-circuit
    this.cache = null
    this.emit('invalidate')
    this.parent?.invalidate()               // cascade upward
    this.surface?.schedule()
    return this
  }

  getRows(ctx: RenderCtx): string[] {
    if (this.cache !== null) return this.cache
    this.cache = this.render(ctx)
    return this.cache
  }
}
```

### 7.2 Propagation properties

1. **Short-circuiting on already-dirty ancestors.** Bursts of mutation cost
   O(ancestor-depth) for the first mutation, then O(1) for each subsequent
   mutation until the next flush. A node dropping 500 state updates in a
   single microtask results in exactly one upward walk.

2. **Parents re-render cheaply.** A Box whose child changed still calls
   `getRows()` on each child, but unchanged children return their cached
   rows in O(1). Only the dirty subtree actually computes.

3. **Invalidate is both a framework hook and a public event.** The render
   loop subscribes internally; external observers (devtools, tests) can
   attach to the same `invalidate` event.

### 7.3 Scheduling

Each surface coalesces invalidations via `queueMicrotask`:

```ts
class Surface {
  private scheduled = false

  schedule() {
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      this.flush()
    })
  }
}
```

For agent-streaming workloads (20–60 state updates per second, trees of
~50 nodes) microtask coalescing yields one render pass per microtask. If
finer control is needed, `schedule()` is pluggable (e.g., swap for an
`setImmediate`-based tick, or frame-rate limit).

### 7.4 Surface flush strategies

**`ui` (footer):**
- Re-render the footer tree under current terminal width.
- Diff new rows against last-rendered rows by row-index string equality.
- For each changed row: `\x1b[<absRow>;1H\x1b[2K<new>`.
- For rows removed from the bottom: `\x1b[2K`.

**`stream`:**

The Stream surface owns two pieces of per-tail state:

- `committedCount`: how many rows at the head of the current tail's output
  have already been written to scrollback and are no longer re-renderable.
- `lastLiveRows`: the rows currently drawn in the live region (used for
  diffing).

Both are reset when a new node becomes the tail.

```
tailRows    = liveTail.getRows(ctx)
liveHeight  = terminalHeight - uiHeight

// 1. Commit overflow to scrollback
if (tailRows.length - committedCount > liveHeight) {
  overflow = (tailRows.length - committedCount) - liveHeight
  stdout.write(
    tailRows.slice(committedCount, committedCount + overflow).join('\n') + '\n'
  )
  committedCount += overflow
}

// 2. Diff the still-live portion
liveSlice = tailRows.slice(committedCount)
diffRows(lastLiveRows, liveSlice)   // emit \x1b[<row>;1H rewrites
lastLiveRows = liveSlice
```

When a new node is appended:

1. Any remaining `lastLiveRows` (the final state of the old tail) is written
   as plain lines into scrollback.
2. The old tail node is dropped (framework no longer holds a reference;
   listeners are cleaned up).
3. `committedCount` and `lastLiveRows` are reset for the new tail.

**`overlay`:**
- On open: snapshot the current live + footer rendering into a 2D cell buffer.
- Each frame: composite the overlay's rows over the snapshot at its (x, y);
  diff cells vs last frame; emit ANSI.
- On close: discard buffer, repaint footer, resume stream mode.

The overlay buffer is the **only** place in the framework that uses a 2D
cell grid. Elsewhere, everything is row strings.

### 7.5 Explicit non-features

- No virtual-DOM diffing.
- No keyed reconciliation for children.
- No character-level within-row diffing — whole-row replacement is the unit.

---

## 8. Style System

### 8.1 Base `Style`

```ts
type Color = string        // '#rrggbb' | '#rgb' | ansi-name | 'inherit'

interface Style {
  fg?:        Color
  bg?:        Color
  bold?:      boolean
  dim?:       boolean
  italic?:    boolean
  underline?: boolean
  inverse?:   boolean
  strikethrough?: boolean
}
```

`BoxStyle` and `TextStyle` both extend `Style`. Style properties on the node's
`state` apply over the node's rendered content.

### 8.2 Style composition rules

- **fg**: parent's fg applies where children did not set their own. Since
  shiki/marked/chalk always set fg on styled text, parent fg is mostly a
  no-op in styled subtrees — which is the desired behavior.
- **bg**: parent's bg applies across the entire row, including padding.
  Implemented via the `\x1b[0m` → `\x1b[0m<reapply-bg>` post-process inside
  `Box.render` when `bg` is set.
- **Attributes (bold/dim/italic/underline)**: additive. Parent's attr ORs
  into child's effective attrs for runs that don't override them. Opt-in
  per attribute.

---

## 9. Layout System

A deliberate subset of CSS flexbox, using the same names where applicable.

### 9.1 `BoxStyle`

```ts
type Pct  = `${number}%`
type Size = number | Pct | 'auto' | 'fill'

interface BoxStyle extends Style {
  // flex container
  flexDirection?: 'row' | 'column'    // default: 'column'
  gap?: number                         // default: 0

  // flex item (applied when nested inside another flex container)
  flexGrow?:   number                  // default: 0
  // flexShrink deferred to v2

  // sizing
  width?:     Size
  height?:    Size
  minWidth?:  Size
  maxWidth?:  Size
  minHeight?: Size
  maxHeight?: Size

  // chrome
  padding?:     number | [v: number, h: number] | [t: number, r: number, b: number, l: number]
  border?:      boolean | 'single' | 'double' | 'rounded' | BorderChars
  borderTitle?: string
}

interface TextStyle extends Style {
  content: string
  width?:  Size
  wrap?:   'word' | 'char' | 'none'   // default: 'word'
}

interface BorderChars {
  h:  string;  v:  string
  tl: string; tr: string; bl: string; br: string
}
```

### 9.2 Width flows top-down, height emerges bottom-up

The root surface knows the terminal width. Each container resolves its own
width and allocates child widths according to direction + flex properties.
Leaf nodes render at their allocated width and return however many rows they
need. Height only "allocates" when `height` is explicitly set on a container.

### 9.3 Column direction (default)

Trivial — children are stacked vertically:

```
contentWidth = parent.contentWidth
for child in children:
  childRows = child.getRows({ width: contentWidth })
  append to output, with `gap` blank rows between siblings
```

`flexGrow` in a column is only meaningful when the container has a fixed
`height` — it distributes remaining vertical space.

### 9.4 Row direction

Four-step algorithm:

1. **Allocate widths.**
   - Sum fixed widths.
   - `remaining = contentWidth - fixedSum - gap * (n - 1)`
   - Distribute `remaining` among `flexGrow > 0` children proportionally.
   - Clamp each to `[minWidth, maxWidth]`.

2. **Render children** at their allocated widths. Each child returns `Rows`.

3. **Align heights.** Compute `maxHeight = max(...rows.map(r => r.length))`.
   Pad shorter children with blank bg-colored rows to `maxHeight` (align-start
   for v1).

4. **Zip horizontally.** For each row index:
   `concat(child[0].rows[r], gapSpaces, child[1].rows[r], gapSpaces, ...)`.
   Each child's row is already padded to its allocated width (§4 convention).

### 9.5 Size resolution

- `number`: absolute cells.
- `Pct`: resolved against the parent's content width (or height).
- `'auto'`: natural size = longest single row when rendered at `width: ∞`.
  Only triggered when `width === 'auto'`; cheap for leaf text, fine for trees.
- `'fill'`: equivalent to `100%` in the current flex allocation context.

`min/max` are applied after the base value is computed and clamp it.

### 9.6 Text wrapping and `auto`

- `wrap: 'word'` (default): breaks on whitespace, natural width = longest
  single word. Matches CSS `min-content`.
- `wrap: 'char'`: breaks per grapheme, natural width = widest single rune.
- `wrap: 'none'`: no wrapping, natural width = full display width; overflow
  is truncated or clipped by the container.

### 9.7 Padding & border

Applied in this order inside `Box.render`:

```
1. Allocate inner width:  inner = contentWidth - 2*padH - (border ? 2 : 0)
2. Layout children into `inner` rows (per §9.3/9.4)
3. Pad left/right with spaces (bg-colored) to `contentWidth - (border?2:0)`
4. Pad top/bottom with blank rows (padV rows top and bottom)
5. Wrap with border chars (if border); top row carries `borderTitle`
6. Apply bg reapply post-process
```

`borderTitle` is truncated with an ellipsis when it exceeds `contentWidth − 4`
display cells.

### 9.8 Deferred to v2 (intentionally)

- `flexShrink` — v1 lets content clip or wrap when over-constrained.
- `justifyContent`, `alignItems` — default to start-aligned behavior.
- `flexBasis` — overlaps with `width`; rarely useful.
- `flex-wrap` — multi-line flex containers. Agent harness does not need this.
- `position: absolute` — reserved for the overlay mode; not general-purpose
  positioning.

---

## 10. Public API Surface

```ts
// packages/tui/src/index.ts — top-level re-exports

// factories
export function text(content: string, style?: Omit<TextStyle, 'content'>): Text
export function text(style: TextStyle): Text

export function box(style: BoxStyle, ...children: (Node | false | null | undefined)[]): Box
export function box(...children: (Node | false | null | undefined)[]): Box

export function node<S extends object, E extends Events = BaseEvents>(
  initialState: S,
  render: (args: { state: S; ctx: RenderCtx; emit: TypedEmitter<E>['emit'] })
          => Node | (Node | false | null | undefined)[]
): Node<S, E>

// renderer
export function createRenderer(opts?: RendererOptions): Renderer

interface Renderer {
  readonly stream:  Stream
  readonly ui:      UI
  readonly overlay: Overlay     // inactive until .open() called
  start(): void
  stop(): void
}

interface Stream {
  append(node: Node): this      // auto-commits previous tail
}

interface UI {
  readonly root: Box            // the footer tree; set its children as usual
}

interface Overlay {
  open(node: Node, opts?: { x?: number; y?: number; width?: number; height?: number }): void
  close(): void
  readonly active: boolean
}

// types
export type { Node, Text, Box, Style, BoxStyle, TextStyle,
              Color, Size, Pct, Events, BaseEvents, BoxEvents,
              TypedEmitter, RenderCtx, Theme, BorderChars, RendererOptions }
```

`Input`, `input()`, `InputStyle`, and `InputEvents` are exported from the
follow-up input module once its spec is finalized (§11).

### Renderer options

```ts
interface RendererOptions {
  stdin?:    NodeJS.ReadStream            // default: process.stdin
  stdout?:   NodeJS.WriteStream            // default: process.stdout
  theme?:    Theme
  uiHeight?: number                        // default: auto-measured from ui tree
  onExit?:   () => void | Promise<void>
}
```

### Lifecycle

`createRenderer()` → `renderer.start()` installs the scroll region, raw-mode
stdin (for input routing), and registers exit cleanup. `renderer.stop()`
restores terminal state. A registered SIGINT/SIGTERM handler calls `stop()`
automatically.

---

## 11. Input & Focus (outline; detailed spec is follow-up work)

Out of scope for this spec in detail. High-level shape for orientation only:

- Keyboard events parsed from stdin (Kitty keyboard protocol where supported,
  fallback to ANSI CSI sequences).
- One node in `ui` is **focused** at a time (tracked by the renderer).
- Key events routed to the focused node; if not handled (node doesn't emit
  `true` from its handler), the event bubbles up through ancestors, then to
  the renderer-level `onKey`.
- `Input` node owns its own state.value, emits `input` and `submit`.

A separate follow-up spec will cover focus management, keybinding maps,
mouse support, and paste handling.

---

## 12. Package Layout

```
packages/tui/
├── package.json                    # existing
├── src/
│   ├── index.ts                    # public exports (§10)
│   ├── runtime.bun.ts              # bun-native ansi utils
│   ├── runtime.node.ts             # node-compat ansi utils
│   ├── core/
│   │   ├── emitter.ts              # typed emitter (~40 lines)
│   │   ├── node.ts                 # NodeBase, state proxy, invalidate
│   │   ├── render-ctx.ts           # RenderCtx, Theme
│   │   └── types.ts                # shared types (Size, Color, ...)
│   ├── style/
│   │   ├── ansi.ts                 # fg/bg/attr → escape sequences
│   │   ├── compose.ts              # bg-reapply post-process
│   │   └── color.ts                # color parsing
│   ├── layout/
│   │   ├── column.ts               # vertical stacking
│   │   ├── row.ts                  # horizontal flex + zip
│   │   ├── size.ts                 # Size resolution
│   │   └── border.ts               # border drawing + title
│   ├── nodes/
│   │   ├── text.ts
│   │   ├── box.ts
│   │   └── input.ts
│   ├── renderer/
│   │   ├── terminal.ts             # stdin/stdout, raw mode, scroll region
│   │   ├── stream.ts               # live-tail tracking, commit logic
│   │   ├── ui.ts                   # footer diff+redraw
│   │   ├── overlay.ts              # 2D buffer compositing
│   │   └── index.ts                # createRenderer()
│   └── input/                      # (follow-up spec)
└── test/
    └── ...
```

---

## 13. Open Questions / Future Work

- **Resize handling.** What gets re-rendered on SIGWINCH? v1 answer: flush
  all surfaces; live-tail re-renders at new width; older committed rows keep
  their old width (terminal reflow semantics are platform-dependent and we
  honestly can't fix them).
- **Theme system.** The `Theme` type is referenced but its contents are
  unspecified. Minimum viable: a `colors` map (primary, dim, ok, warn,
  err, muted) and maybe a `borders` preset map. Define concretely in a
  follow-up.
- **Markdown + shiki wrappers.** Thin convenience nodes that wrap
  `marked-terminal` and `shiki` output as Text/Box nodes. Not in v1 core;
  probably live in `@zaly/tui/markdown` as a subpath export.
- **Testing strategy.** Render-to-string + snapshot diffing is the obvious
  approach for node output. Terminal-integration tests will need a PTY
  harness; tbd.

---

## 14. Summary

- Direct-mode, append-mostly to scrollback, sticky footer via DECSTBM.
- Three surfaces (`stream`, `ui`, `overlay`); lifecycle is live-tail →
  committed with auto-commit on append.
- Render output is `string[]` of ANSI rows; no cell grids in the hot path.
- `Node<S, E>` as the single primitive. State is a Proxy; mutation auto-
  invalidates the per-node row cache; ancestors cascade-invalidate; flushes
  coalesce via microtask.
- Factories (`box`, `text`, `input`, `node`) return typed, mutable handles.
- Flex-subset layout inside `Box.render`; row-direction does horizontal zip.
- Platform abstraction via a single `#runtime` module; Bun fast-path,
  Node fallback.
- No native code, no JSX, no reconciler, no template strings.
