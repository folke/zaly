import type { MountCtx, RenderCtx } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { Owner, Reactive } from "../core/reactive.ts"
import type { ActionDef } from "../input/actions.ts"
import type { TuiReporterOpts } from "../services/logger.ts"
import type { Theme } from "../themes/types.ts"
import type { RenderFrame } from "./frame.ts"
import type { Surface } from "./surface.ts"
import type { TerminalReader, TerminalWriter } from "./terminal.ts"

import { Emitter } from "@zaly/shared"
import { stringWidth } from "@zaly/shared/ansi"
import { Logger } from "@zaly/shared/logger"
import { createCtx } from "../core/ctx.ts"
import {
  createRoot,
  memo,
  peek,
  provideContext,
  signal,
  untrack,
  unwrap,
  useActiveOwner,
} from "../core/reactive.ts"
import { RenderContext } from "../core/render.ts"
import { Actions } from "../input/actions.ts"
import { Decoder } from "../input/decoder.ts"
import { defaultActions } from "../input/defaults.ts"
import { InputRouter } from "../input/router.ts"
import { TuiReporter } from "../services/logger.ts"
import { styleBuilder as buildStyle } from "../style/builder.ts"
import { defaultTheme } from "../themes/registry.ts"
import { Frame } from "./frame.ts"
import { OverlaySurface } from "./overlay.ts"
import { Stream } from "./stream.ts"
import { Terminal } from "./terminal.ts"
import { UI } from "./ui.ts"

export interface RendererOptions {
  stdin?: TerminalReader
  stdout?: TerminalWriter
  images?: Reactive<boolean>
  theme?: Theme
  /** Baseline footer height in rows — the size the footer occupies in
   *  "steady state" (no autocomplete, no transient widget growth).
   *  Stream uses `terminal.rows - fixedFooterHeight` as its commit
   *  threshold, so scrollback ends exactly at the visible region's top
   *  edge whenever the footer is at this size. Default `0` (commit at
   *  the full terminal — preserves pre-existing behavior). Set to
   *  match your app's persistent footer (e.g. 2 for a single-line
   *  input with a one-line border). */
  fixedFooterHeight?: number
  /** Enable alternate screen buffer. Useful to test whether native
   *  scrollback is competing with app-level scrolling. */
  altScreen?: boolean
  /** Register SIGINT/SIGTERM cleanup (default: true). Disable in tests. */
  hookSignals?: boolean
  logger?: Logger
  /** Enable terminal mouse reporting. Scroll events scroll the stream. */
  mouse?: boolean
  reporter?: TuiReporterOpts
}

export type RenderEvents = {
  start: {}
  stop: {}
  dirty: {}
}

export type SurfaceType = "stream" | "ui" | "overlay"

/** Visitor signature for `Renderer.walk`. Return `"stop"` to halt. */
export type NodeVisitor = (node: Node) => void | "stop"

export class RenderStats {
  #stats: Record<string, number> = {}

  /** Increment a stat by `delta` (default: `1`). */
  inc(stat: string, delta = 1): void {
    this.#stats[stat] = (this.#stats[stat] ?? 0) + delta
  }

  set(stat: string, value: number): void {
    this.#stats[stat] = value
  }

  get(): Record<string, number> {
    return { ...this.#stats }
  }
}

/**
 * Wires a `Terminal` primitive with the `Stream` and `UI` surfaces.
 * Doesn't render anything until you either append to `renderer.stream`
 * or add children to `renderer.ui.root`.
 *
 * ```ts
 * const renderer = new Renderer()
 * renderer.start()
 * renderer.stream.append(text("hello"))
 * renderer.ui.root.add(input({ placeholder: "> " }))
 * // ... later
 * renderer.stop()
 * ```
 */
export class Renderer extends Emitter<RenderEvents> {
  readonly stream: Stream
  readonly ui: UI
  readonly overlay: OverlaySurface
  readonly terminal: Terminal
  readonly input: InputRouter
  readonly frame: Frame
  /** Always-on logger, auto-attached to `this.stream`. Calling
   *  `renderer.log("msg")` logs at `"log"` level; level methods
   *  (`renderer.log.error(...)` etc.) are also available. */
  readonly logger: Logger

  readonly #decoder = new Decoder()
  readonly #stdin: TerminalReader & { setEncoding?: (enc: string) => void }

  #theme = signal<Theme | undefined>(undefined)

  /** Root Owner — every surface's function-shape `add` / `append` runs
   *  its child under this Owner via `withOwner(#rootOwner, …)`, so
   *  context values provided here (`RenderContext`, future global
   *  scopes) are visible to every widget body in the tree. */
  readonly #rootOwner: Owner
  #running = false
  #escTimer: ReturnType<typeof setTimeout> | undefined
  #rendering?: Promise<void>
  #dirty = false
  #debug = false
  /** Monotonic cache-key for `RenderCtx`. Bumped on any event that
   *  invalidates every node cache in the tree (resize, theme swap). */
  #ctxVersion = 0
  #ctx: RenderCtx | undefined

  /** Runtime action registry (catalog + dispatcher). Populated with
   *  `defaultActions` + `globalActions` at construction; apps extend
   *  via `renderer.actions.register({ "app.foo": { ... } })`. */
  readonly actions: Actions
  stats = new RenderStats()

  /** Global action impls. Merged into the `actions` catalog on
   *  construction so the ids declared here gain their keys and desc
   *  from `defaultActions`. Using `satisfies` (rather than an explicit
   *  type annotation) keeps the literal keys so `BuiltinAction` can
   *  pull them out. */
  globalActions = {
    "global.quit": {
      fn: (): void => {
        this.stop()
        process.exit(0)
      },
    },
  } satisfies Record<string, ActionDef>

  constructor(opts: RendererOptions = {}) {
    super()
    this.terminal = new Terminal({
      altScreen: opts.altScreen,
      hookSignals: opts.hookSignals,
      mouse: opts.mouse,
      stdin: opts.stdin,
      stdout: opts.stdout,
    })
    this.frame = new Frame(this.terminal)

    if (opts.theme) this.#theme.set(opts.theme)

    // Root Owner: an entry point for `useContext` walks. Every widget
    // body added via `ui.add(fn)` / `stream.append(fn)` / `overlay.add(fn)`
    // runs under this Owner, so `useContext(RenderContext)` resolves
    // to the values provided here.
    this.#rootOwner = createRoot(() => {
      provideContext(RenderContext, {
        images: memo(() => unwrap(opts.images) ?? true),
        style: memo(() => buildStyle(this.#theme.get())),
        theme: this.#theme.get,
      })
      return useActiveOwner() as Owner
    })

    this.ui = new UI(this)
    this.stream = new Stream(this, {
      fixedFooterHeight: opts.fixedFooterHeight,
    })
    // Surfaces render into the shared frame; the renderer owns scheduling,
    // lifecycle events, and paint order.
    this.overlay = new OverlaySurface(this)
    this.logger = opts.logger ?? new Logger({ name: "renderer" })

    this.input = new InputRouter(this.logger.child({ name: "input" }))
    this.actions = new Actions(this.logger.child({ name: "actions" }))

    const reporter = new TuiReporter(opts.reporter)
    reporter.attach({ append: (node) => this.stream.append(node) })

    this.logger.attach("tui", reporter)

    // Wire the action registry: Actions looks up the focused node
    // (so programmatic dispatch starts there) and the Router hands
    // matched keymap action ids back to the registry for dispatch.
    this.actions.setTargetResolver(() => this.input.focused)
    this.input.setActions(this.actions)
    this.input.on("mouse", ({ event }) => {
      void this.stream.scroll(event.deltaY)
    })
    // Rebuild the Router's keymap whenever the catalog changes. Action
    // `.keys` fields are the single source of truth for default
    // bindings; `setKeymap` can still be called by apps to override.
    // Bundled metadata + impls. `register` merges by id, so the
    // `globalActions` `fn` entries augment the docs/keys already
    // supplied by `defaultActions`.
    this.actions.register(defaultActions, { default: true })
    this.actions.register(this.globalActions, { default: true })

    // Untrack to prevent dep leaking
    this.on("dirty", () => untrack(() => this.#schedule()))

    // SIGWINCH: dimensions changed. The terminal has re-wrapped its
    // existing content against the new column count; our on-screen
    // positioning bookkeeping (stream's `#rows`/`#scrollbackCount`,
    // ui's `#rows`) is from before the resize and no longer maps to
    // what's really painted. Cleanest recovery:
    //
    //   1. Bump `ctxVersion` + drop cached `#ctx` so every node's
    //      cache self-invalidates and re-renders at the new width on
    //      the next pass.
    //   2. Clear the scroll region (DECSTBM defaults to full viewport)
    //      then wipe the screen with ED. The UI surface's next render
    //      will reissue DECSTBM against the new row count.
    //   3. Tell both surfaces to forget their paint mirrors
    //      (`onResize`). Node state is preserved — we still have every
    //      stream node — so the re-render just replays them from
    //      scratch at the new geometry.
    this.terminal.onResize(() => {
      this.#ctxVersion++
      this.#ctx = undefined
      this.terminal.sync(() => {
        // Drop DECSTBM so ED clears the entire display (some terminals
        // honour the region for ED; full reset avoids ambiguity), wipe
        // the screen, then reissue DECSTBM against the NEW row count
        // if a footer is reserved. `setReserveBottom` would early-return
        // (the stored `#reserveBottom` hasn't changed), so we bypass it
        // and talk to `setScrollRegion` directly.
        this.terminal.clearScrollRegion()
        this.terminal.write(`${this.terminal.moveTo(1, 1)}\x1b[2J`)
        if (this.terminal.reserveBottom > 0) {
          this.terminal.setScrollRegion(1, this.terminal.scrollBottom)
        }
      })
      this.frame.reset()
      this.stream.onResize()
      this.ui.onResize()
    })

    this.#stdin = (opts.stdin ?? (process.stdin as unknown as TerminalReader)) as TerminalReader & {
      setEncoding?: (enc: string) => void
    }
  }

  /**
   * Shared `RenderCtx` for the current tick. Built on demand and
   * reused across every `Node.render(ctx)` call until the version
   * bumps (resize, theme swap). Nodes compare `ctx.version` against
   * their cached row's version — simple integer check, no hashing.
   */
  get ctx(): RenderCtx {
    if (
      this.#ctx === undefined ||
      this.#ctx.version !== this.#ctxVersion ||
      this.#ctx.width !== this.terminal.cols
    ) {
      this.#ctx = createCtx({
        theme: peek(this.#theme.get), // Untrack to prevent dep leaks from `ctx.theme` reads in render.
        transmit: (seq) => this.terminal.enqueueTransmit(seq),
        version: this.#ctxVersion,
        width: this.terminal.cols,
      })
    }
    return this.#ctx
  }

  get rootOwner(): Owner {
    return this.#rootOwner
  }

  get mouse(): boolean {
    return this.terminal.mouse
  }

  set mouse(mouse: boolean) {
    this.terminal.mouse = mouse
  }

  get debug(): boolean {
    return this.#debug
  }

  set debug(debug: boolean) {
    if (this.#debug === debug) return
    this.#debug = debug
    this.#schedule()
  }

  /** Whether the renderer is currently running. Surfaces use this to
   *  decide whether a fresh append/open should immediately mount the
   *  node or just queue it for the next `start()`. */
  get running(): boolean {
    return this.#running
  }

  /** Shortcut for `renderer.input.bind(pattern, handler)`. Returns an
   *  unsubscribe function. Use for one-off app-level bindings where a
   *  named action would be overkill. */
  bind: Actions["bind"] = (binding) => this.actions.bind(binding)

  /** Swap the ambient theme. Widgets that read `theme()` / `style()`
   *  from `useContext(RenderContext)` re-fire automatically; primitive
   *  Nodes that compare cache against `ctx.version` need the version
   *  bump that already happens elsewhere on theme-driven invalidation. */
  set theme(theme: Theme) {
    this.#theme.set(theme)
    this.#ctxVersion++
    this.#schedule()
  }

  /** Get the current theme. (tracked) */
  get theme(): Theme {
    return this.#theme.get() ?? defaultTheme
  }

  start(): void {
    if (this.#running) return
    this.#running = true
    this.terminal.start()
    this.#stdin.setEncoding?.("utf8")
    this.#stdin.on("data", this.#onData)
    this.#stdin.resume?.()
    // Mount every surface's tracked tree. Build one MountCtx per
    // surface; each shares the same underlying services (router,
    // overlay, tree walk), only the `surface` tag differs.
    void this.emit("start")
    // Anything that called `emit("dirty")` before `start()` set
    // `#dirty = true` but couldn't schedule (no renderer yet). Now
    // that we're running, drain it.
    if (this.#dirty) this.#schedule()
    // setInterval(() => {
    //   console.log(this.stats.get())
    // }, 5000)
  }

  stop(): void {
    if (!this.#running) return
    // Unmount before tearing the terminal down so widgets that
    // scheduled teardown work (timers, subscriptions) have a clean
    // chance to run before their last render.
    void this.emit("stop")
    this.#running = false
    this.#stdin.off("data", this.#onData)
    this.#stdin.pause?.()
    if (this.#escTimer !== undefined) {
      clearTimeout(this.#escTimer)
      this.#escTimer = undefined
    }
    this.terminal.stop()
  }

  /** Look up a node by its `id`. Returns `undefined` if nothing matches. */
  getNode(id: string): Node | undefined {
    let found: Node | undefined
    this.walk((n) => {
      if (n.id() !== id) return undefined
      found = n
      return "stop"
    })
    return found
  }

  /**
   * Find every node matching a predicate. When passed a string, it's
   * interpreted as `node.type === string` — the common "find all
   * Inputs" case. For anything richer, pass a function.
   */
  findNode(match: string | ((node: Node) => boolean)): Node[] {
    const pred = typeof match === "string" ? (n: Node): boolean => n.type === match : match
    const out: Node[] = []
    this.walk((n) => {
      if (pred(n)) out.push(n)
    })
    return out
  }

  /**
   * Walk every node in the combined stream + UI tree, depth-first,
   * parents before children. Return `"stop"` from the visitor to halt.
   */
  walk(visit: NodeVisitor): void {
    // Roots: the UI tree (single root Box) + every live stream node.
    // Each root gets a depth-first visit, parent first. A `"stop"`
    // return from the visitor shortcuts the whole traversal — not
    // just the current subtree — so callers can bail early.
    const stopped = { v: false }
    const visitNode = (n: Node): void => {
      if (stopped.v) return
      if (visit(n) === "stop") {
        stopped.v = true
        return
      }
      for (const c of n.children) visitNode(c)
    }
    visitNode(this.ui.root)
    for (const n of this.stream.nodes) visitNode(n)
    for (const n of this.overlay.nodes) visitNode(n)
  }

  /** Build a MountCtx for a given surface. Each call creates a fresh
   *  object but closes over the same underlying services, so nodes
   *  across surfaces share a single overlay surface, router, etc. */
  mountCtx(surface: SurfaceType): MountCtx {
    const logger = this.logger.child({ name: surface, surface })
    const input = this.input
    return {
      actions: this.actions,
      findNode: (m) => this.findNode(m),
      getNode: (id) => this.getNode(id),
      input: {
        bind: (binding) => this.actions.bind(binding),
        blur: () => this.input.focus(undefined),
        events: this.input,
        focus: (node) => this.input.focus(node),
        get terminalFocus(): boolean {
          return input.terminalFocus
        },
      },
      logger,
      overlay: {
        add: (o) => this.overlay.add(o),
        remove: (o) => this.overlay.remove(o),
      },
      surface,
    }
  }

  /** Mark dirty and ensure the render loop is active. Cheap and
   *  idempotent — synchronous invalidations within the same tick all
   *  collapse into one paint via the microtask boundary at the top of
   *  the loop. */
  #schedule(): void {
    this.#dirty = true
    // Nothing to paint until the renderer is actually running.
    // Tracked `#dirty` is preserved so `start()` picks it up via the
    // initial mount-triggered flush (or the first invalidate after).
    if (!this.#running) return
    if (this.#rendering !== undefined) return

    this.#rendering = (async () => {
      try {
        // Microtask boundary: batch every same-tick invalidation into
        // one paint. Without this, the first `await` inside `#render`
        // may or may not happen early enough for synchronous follow-up
        // invalidates to land in the same pass.
        await Promise.resolve()
        while (this.#dirty && this.#running) {
          this.#dirty = false
          try {
            this.stats.inc("render")
            // oxlint-disable-next-line no-await-in-loop
            await this.#render()
          } catch (error) {
            // Kill the loop before the trace lands, so no further
            // paints race against the crash handler's output. Re-throw
            // next tick so `uncaughtException` picks it up with the
            // terminal already torn down cleanly.
            this.#running = false
            this.logger.child("render").error(error)
            process.nextTick(() => {
              throw error
            })
            return
          }
        }
      } finally {
        this.#rendering = undefined
      }
    })()
  }

  /** Force a paint if dirty, and wait until the loop is idle. Useful
   *  for tests and external "redraw and tell me when done" flows.
   *  Concurrent callers share the same in-flight promise — no extra
   *  paints are queued. */
  async render(): Promise<void> {
    if (!this.#running) return
    this.#schedule()
    if (this.#rendering !== undefined) await this.#rendering
  }

  /** Render dirty surfaces into a shared full-viewport frame, then flush
   * queued terminal ops and final row diffs in one atomic terminal sync. */
  async #render(): Promise<void> {
    const frame = this.frame.begin()
    const render = async (surface: Surface): Promise<void> => {
      if (!surface.dirty) return
      await surface.render(frame)
    }
    await render(this.stream)
    await render(this.ui)
    frame.commitBase()
    await render(this.overlay)
    if (this.#debug) this.#renderDebug(frame)
    // Flush any side-channel transmits (e.g. KGP image data queued by
    // Image widgets during render) BEFORE entering the synced frame.
    // The terminal stores transmitted bytes globally — placements in
    // the frame body reference them by id and just need them to have
    // arrived first.
    this.terminal.flushTransmits()
    this.terminal.sync(() => {
      const s = frame.paint()
      this.stats.inc("paint-ops", s.ops)
      this.stats.inc("paint-rows", s.rows)
    })
  }

  #renderDebug(frame: RenderFrame): void {
    const stats = this.stats.get()
    const rows = Object.entries(stats)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}: ${value}`)
    rows.unshift(`debug: ${new Date().toLocaleTimeString()}`)

    const width = Math.min(this.terminal.cols, Math.max(...rows.map((row) => stringWidth(row)), 0))
    const x = Math.max(1, this.terminal.cols - width + 1)
    for (let i = 0; i < rows.length && i < this.terminal.rows; i++) {
      frame.overlay(i + 1, x, rows[i])
    }
  }

  // stdin wiring. In raw mode the terminal delivers bytes directly —
  // including ctrl-c as 0x03 rather than SIGINT — so we decode here and
  // hand events off to the router. Arrow so `stdin.off("data", …)`
  // removes the same reference we attached.
  readonly #onData = (chunk: unknown): void => {
    // stdin may deliver strings (when setEncoding was called) or Buffers.
    const text = typeof chunk === "string" ? chunk : String(chunk)
    for (const ev of this.#decoder.feed(text)) this.input.dispatch(ev)
    // Any pending `\x1b` will hang in the decoder until more bytes
    // arrive. Schedule a short timer so a lone ESC keypress commits as
    // an `esc` event rather than waiting indefinitely.
    if (this.#escTimer !== undefined) clearTimeout(this.#escTimer)
    this.#escTimer = setTimeout(() => {
      this.#escTimer = undefined
      for (const ev of this.#decoder.flush()) this.input.dispatch(ev)
    }, 25)
    this.#escTimer.unref()
  }
}
