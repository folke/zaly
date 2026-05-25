import type { Emitter } from "@zaly/shared"
import type { Logger } from "@zaly/shared/logger"
import type { Actions } from "../input/actions.ts"
import type { InputRouterEvents } from "../input/router.ts"
import type { SurfaceType } from "../renderer/renderer.ts"
import type { StyleBuilder } from "../style/builder.ts"
import type { Theme } from "../themes/types.ts"
import type { Overlay } from "../widgets/overlay.ts"
import type { Node } from "./node.ts"
import type { Accessor } from "./reactive.ts"

import { style } from "../style/builder.ts"
import { defaultTheme } from "../themes/registry.ts"
import { createContext } from "./reactive.ts"

/** Components-facing slice of the render environment — reactive
 *  accessors a widget body reads via `useContext(RenderContext)`. Use
 *  this when a widget needs ambient theme/style outside an `_render`
 *  call (the place where `RenderCtx` is threaded in). Width is
 *  deliberately omitted — that's a per-render allotted-size concept,
 *  not an ambient one. */
export type RenderContextValue = {
  /** Active theme. Tracked — widgets that read it re-fire on swap. */
  theme: Accessor<Theme>
  /** Theme-bound chainable style builder. Derived memo over `theme`. */
  style: Accessor<StyleBuilder>
}

export const RenderContext = createContext<RenderContextValue>()

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
  style: StyleBuilder
  version: number
  /** Queue a side-channel ANSI payload (e.g. KGP image transmit) for
   *  the renderer to flush before the next paint. Use this to keep
   *  side-effecting bytes out of cached row strings — what `_render`
   *  returns should be safe to reuse across paints, and transmit
   *  bytes shouldn't be. */
  readonly transmit: (seq: string) => void
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
  readonly surface: SurfaceType

  /** Overlay capabilities — open/close an Overlay node from inside a
   *  widget (e.g. a confirm dialog, autocomplete popover, tooltip). */
  readonly overlay: {
    readonly add: (o: () => Overlay) => void
    readonly remove: (o: Overlay) => void
  }

  /** Input capabilities — a narrow slice of the router. We deliberately
   *  don't expose the full `InputRouter`: `setKeymap` / `dispatch` are
   *  app-level concerns. Widgets legitimately need to install direct
   *  global key bindings (autocomplete) and move focus. */
  readonly input: {
    readonly terminalFocus: boolean
    readonly events: Emitter<InputRouterEvents>
    readonly bind: Actions["bind"]
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

  logger: Logger
}

/**
 * Current terminal width in cells. Returns `undefined` when stdout isn't a
 * TTY (piped output, tests, non-Node/Bun runtimes) — callers should fall
 * back to a sensible default when this is `undefined`.
 *
 * @internal
 */
function termWidth(): number | undefined {
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
 */
export function createCtx(opts: Partial<RenderCtx> & { theme?: Theme } = {}): RenderCtx {
  const tw = termWidth() ?? 80
  return {
    style: opts.style ?? style(opts.theme ?? defaultTheme),
    transmit: (data) => process.stdout.write(data),
    version: opts.version ?? 0,
    width: Math.min(opts.width ?? tw, tw),
    ...opts,
  }
}
