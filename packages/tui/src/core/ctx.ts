import type { Actions } from "../input/actions.ts"
import type { InputRouter } from "../input/router.ts"
import type { Surface } from "../renderer/index.ts"
import type { Style } from "../style/ansi.ts"
import type { StyleBuilder } from "../style/builder.ts"
import type { Theme } from "../themes/index.ts"
import type { Overlay } from "../widgets/overlay.ts"
import type { Node } from "./node.ts"
import type { Reactive } from "./reactive.ts"

import { style } from "../style/builder.ts"
import { defaultTheme } from "../themes/index.ts"
import { createContext } from "./reactive.ts"

export type { StyleBuilder, Theme }

/** Context published by `Node.render` for every `_render` call. Widget
 *  bodies and effects can read it via `useContext(RenderCtxContext)`
 *  to access width/theme/style without re-plumbing or signal-mutation
 *  workarounds. Returns `undefined` outside a render — e.g. when the
 *  widget body runs in the WidgetNode constructor before any render.
 *
 *  Reactive note: this is a context, not a signal. Reads inside
 *  effects don't subscribe to ctx changes; effects that depend on
 *  width/theme should re-fire from a different source (e.g. a signal
 *  the widget's body owns, or recompute inside a leaf thunk that
 *  re-evaluates per render). */
export const RenderContext = createContext<RenderCtx | undefined>(undefined)

/**
 * Fields every Node reads off its state. Widget state types should
 * extend this (directly or transitively via `Style`, which extends
 * `BaseState`) so the base behaviour wires up automatically.
 *
 *   - `visible: false` suppresses rendering with zero layout footprint.
 *     Accepts a `Reactive<boolean>` — pass a signal accessor to toggle
 *     visibility from shared state. `Node.render` unwraps it at render
 *     time so the subscription goes through the usual tracking ctx.
 */
type BaseState = {
  visible?: Reactive<boolean>
}

export type State<T extends object = object> = T & BaseState

/** Widget state mixin: `Style` (fg/bg/attrs) plus `BaseState`
 *  (visibility + any future framework-level state fields). Widget state
 *  interfaces extend this so base-state concerns and pure styling stay
 *  cleanly separated at the type level without each widget having to
 *  compose the two manually. */
export type StyleState = Style

/**
 * Passed to every `render(ctx)` call. Width flows in; height emerges from
 * the returned row count. Theme is ambient — children share the parent's.
 *
 * `style` is a theme-bound chainable builder made available to components so
 * they can produce inline-styled strings without re-binding the theme.
 *
 * `version` is a monotonic cache-key bumped by the `Renderer` whenever any
 * identity-relevant ctx field changes (resize, theme swap). Node caches
 * compare this integer — no hashing, no string keys.
 */
export interface RenderCtx {
  width: number
  theme: Theme
  style: StyleBuilder
  version: number
  /** Whether async work registered during render is allowed to settle
   *  *after* `render()` returns.
   *
   *  - `true` (default) — fire-and-forget: descendants' `createAsync`
   *    starts work, the render returns whatever's available now, and
   *    signal updates from the resolving promises invalidate
   *    subscribers later. Right for the UI surface, which re-renders
   *    cheaply.
   *  - `false` — drain mode: the outermost `Node.render` installs an
   *    `AsyncTracker`, awaits any pending work registered by
   *    descendants, and re-renders until the tracker is stable before
   *    returning. Right for the stream surface — once rows commit to
   *    scrollback, signal updates can't repaint them. */
  async?: boolean
}

/**
 * Context handed to a node when it mounts onto a surface. Gives widget
 * authors a scoped handle to the services they legitimately need —
 * focus, overlays, tree lookups, out-of-band repaints — without
 * exposing the full Renderer.
 *
 * MountCtx is *per-lifetime*: set once when `mount()` is called and
 * cleared on `unmount()`. Distinct from `RenderCtx` (per-tick, carries
 * width/theme/version). If a node moves between surfaces, it receives
 * a fresh MountCtx via the subsequent `mount()` call.
 */
export interface MountCtx {
  /** Which surface owns this subtree. */
  readonly surface: Surface

  /** Overlay capabilities — open/close an Overlay node from inside a
   *  widget (e.g. a confirm dialog, autocomplete popover, tooltip). */
  readonly overlay: {
    readonly open: (o: Overlay) => void
    readonly close: (o: Overlay) => void
  }

  /** Input capabilities — a narrow slice of the router. We deliberately
   *  don't expose the full `InputRouter`: `setKeymap` / `dispatch` are
   *  app-level concerns. Widgets legitimately need to install direct
   *  global key bindings (autocomplete) and move focus. */
  readonly input: {
    readonly bind: InputRouter["bind"]
    /** Move focus to `node`. Mirrors `router.focus(node)`. */
    readonly focus: (node: Node) => void
    /** Clear focus. */
    readonly blur: () => void
  }

  /** Action registry — widgets and plugins can `register` catalog
   *  entries (with desc + default keys + optional `fn`) and `dispatch`
   *  actions by id. The Router feeds key-triggered dispatches through
   *  here; programmatic callers do the same. */
  readonly actions: Actions

  /** Look up a node anywhere in the tree by its `id`. First match
   *  wins; `undefined` when nothing matches. Same semantics as
   *  `Renderer.getNode`. */
  readonly getNode: (id: string) => Node | undefined
  /** Find every node matching a predicate. Strings match `node.type`;
   *  pass a function for richer predicates. Same semantics as
   *  `Renderer.findNode`. */
  readonly findNode: (match: string | ((n: Node) => boolean)) => Node[]

  /** Queue a side-channel ANSI payload (e.g. KGP image transmit) for
   *  the renderer to flush before the next paint. Use this to keep
   *  side-effecting bytes out of cached row strings — what `_render`
   *  returns should be safe to reuse across paints, and transmit
   *  bytes shouldn't be. */
  readonly transmit: (seq: string) => void
}

/**
 * Current terminal width in cells. Returns `undefined` when stdout isn't a
 * TTY (piped output, tests, non-Node/Bun runtimes) — callers should fall
 * back to a sensible default when this is `undefined`.
 *
 * @internal
 */
export function termWidth(): number | undefined {
  if (typeof process === "undefined") return undefined
  const cols = process.stdout.columns
  return typeof cols === "number" && cols > 0 ? cols : undefined
}

/**
 * Build a fresh `RenderCtx` from a resolved theme + width. Binds a `style`
 * builder to the theme so components can use `ctx.style.primary(...)`
 * without constructing their own.
 *
 * Width is clamped to the terminal's current column count (falling back to
 * 80 when stdout isn't a TTY). No width passed → terminal width is used
 * directly; an explicit `width` wider than the terminal is capped so
 * components never produce rows that wrap the display. Narrower explicit
 * widths (e.g. for fixed-layout tests) pass through unchanged.
 *
 * Dynamic theme loading (from a string name) lives in `themes/loadTheme`
 * — resolve the name first, then pass the `Theme` object here.
 * @internal
 */
export function createCtx(opts?: Partial<RenderCtx>): RenderCtx {
  const theme = opts?.theme ?? defaultTheme
  const tw = termWidth() ?? 80
  return {
    style: style(theme),
    theme,
    version: opts?.version ?? 0,
    width: Math.min(opts?.width ?? tw, tw),
  }
}
