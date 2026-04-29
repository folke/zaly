import type { MountCtx, RenderCtx, Theme } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { ActionInfo } from "../input/actions.ts"
import type { LogCallable, LoggerOptions } from "../logger/logger.ts"
import type { TerminalReader, TerminalWriter } from "./terminal.ts"
import type { UIOptions } from "./ui.ts"

import { createCtx } from "../core/ctx.ts"
import { Actions, defaultActions } from "../input/actions.ts"
import { Decoder } from "../input/decoder.ts"
import { InputRouter } from "../input/router.ts"
import { Logger, makeLog } from "../logger/logger.ts"
import { OverlaySurface } from "./overlay.ts"
import { Stream } from "./stream.ts"
import { Terminal } from "./terminal.ts"
import { UI } from "./ui.ts"

export { OverlaySurface } from "./overlay.ts"
export { Stream } from "./stream.ts"
export { Terminal } from "./terminal.ts"
export { UI } from "./ui.ts"
export { InputRouter } from "../input/router.ts"

export interface RendererOptions {
  stdin?: TerminalReader
  stdout?: TerminalWriter
  theme?: Theme
  /** Upper bound on footer height (default: viewport / 3). */
  uiMaxHeight?: number
  /** Register SIGINT/SIGTERM cleanup (default: true). Disable in tests. */
  hookSignals?: boolean
  /** Options for the built-in `logger` (and its callable `log` accessor). */
  logger?: LoggerOptions
}

export type Surface = "stream" | "ui" | "overlay"

/** Visitor signature for `Renderer.walk`. Return `"stop"` to halt. */
export type NodeVisitor = (node: Node) => void | "stop"

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
export class Renderer {
  readonly stream: Stream
  readonly ui: UI
  readonly overlay: OverlaySurface
  readonly terminal: Terminal
  readonly input: InputRouter
  /** Always-on logger, auto-attached to `this.stream`. Calling
   *  `renderer.log("msg")` logs at `"log"` level; level methods
   *  (`renderer.log.error(...)` etc.) are also available. */
  readonly log: LogCallable
  readonly logger: Logger

  readonly #decoder = new Decoder()
  readonly #stdin: TerminalReader & { setEncoding?: (enc: string) => void }
  readonly #theme: Theme | undefined
  #running = false
  #escTimer: ReturnType<typeof setTimeout> | undefined
  #scheduled = false
  #dirty = false
  /** Monotonic cache-key for `RenderCtx`. Bumped on any event that
   *  invalidates every node cache in the tree (resize, theme swap). */
  #ctxVersion = 0
  #ctx: RenderCtx | undefined
  readonly #onDirty = (): void => this.#schedule()

  /** Runtime action registry (catalog + dispatcher). Populated with
   *  `defaultActions` + `globalActions` at construction; apps extend
   *  via `renderer.actions.register({ "app.foo": { ... } })`. */
  readonly actions = new Actions()

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
  } satisfies Record<string, ActionInfo>

  constructor(opts: RendererOptions = {}) {
    this.terminal = new Terminal({
      hookSignals: opts.hookSignals,
      stdin: opts.stdin,
      stdout: opts.stdout,
    })

    this.#theme = opts.theme
    // Single shared ctx per tick. Rebuilt lazily when version bumps or
    // the cached ctx no longer matches the current terminal width
    // (SIGWINCH handler bumps version + clears `#ctx` below).
    const getCtx = (): RenderCtx => this.ctx

    const uiOpts: UIOptions = {}
    if (opts.uiMaxHeight !== undefined) uiOpts.maxHeight = opts.uiMaxHeight

    this.ui = new UI(this.terminal, getCtx, uiOpts)
    this.stream = new Stream(this.terminal, getCtx)
    this.overlay = new OverlaySurface({
      getCtx,
      stream: this.stream,
      terminal: this.terminal,
      ui: this.ui,
    })
    this.input = new InputRouter()
    this.logger = new Logger(opts.logger)
    this.logger.attach(this.stream)
    this.log = makeLog(this.logger)
    // Wire the action registry: Actions looks up the focused node
    // (so programmatic dispatch starts there) and the Router hands
    // matched keymap action ids back to the registry for dispatch.
    this.actions.setTargetResolver(() => this.input.focused)
    this.input.setActions(this.actions)
    // Rebuild the Router's keymap whenever the catalog changes. Action
    // `.keys` fields are the single source of truth for default
    // bindings; `setKeymap` can still be called by apps to override.
    this.actions.onChange(() => {
      this.input.setKeymapIndex(this.actions.buildKeymap())
    })
    // Bundled metadata + impls. `register` merges by id, so the
    // `globalActions` `fn` entries augment the docs/keys already
    // supplied by `defaultActions`.
    this.actions.register(defaultActions)
    this.actions.register(this.globalActions)

    // Surfaces emit `"dirty"` instead of self-scheduling. Centralising
    // the microtask here means one flush per tick for the whole tree
    // and keeps paint order explicit: stream < ui < overlay.
    this.stream.on("dirty", this.#onDirty)
    this.ui.on("dirty", this.#onDirty)
    this.overlay.on("dirty", this.#onDirty)

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
        theme: this.#theme,
        version: this.#ctxVersion,
        width: this.terminal.cols,
      })
    }
    return this.#ctx
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
  bind: InputRouter["bind"] = (pattern, handler) => this.input.bind(pattern, handler)

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
    this.stream.onStart(this.#mountCtxFor("stream"))
    this.ui.onStart(this.#mountCtxFor("ui"))
    this.overlay.onStart(this.#mountCtxFor("overlay"))
    // Anything that called `emit("dirty")` before `start()` set
    // `#dirty = true` but couldn't schedule (no renderer yet). Now
    // that we're running, drain it.
    if (this.#dirty) this.#schedule()
  }

  stop(): void {
    if (!this.#running) return
    // Unmount before tearing the terminal down so widgets that
    // scheduled teardown work (timers, subscriptions) have a clean
    // chance to run before their last render.
    this.overlay.onStop()
    this.ui.onStop()
    this.stream.onStop()
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
  #mountCtxFor(surface: Surface): MountCtx {
    return {
      actions: this.actions,
      findNode: (m) => this.findNode(m),
      getNode: (id) => this.getNode(id),
      input: {
        bind: (pattern, handler) => this.input.bind(pattern, handler),
        blur: () => this.input.focus(undefined),
        focus: (node) => this.input.focus(node),
      },
      overlay: {
        close: (o) => this.overlay.close(o),
        open: (o) => this.overlay.open(o),
      },
      surface,
      transmit: (seq) => this.terminal.enqueueTransmit(seq),
    }
  }

  #schedule(): void {
    this.#dirty = true
    // Nothing to paint until the renderer is actually running.
    // Tracked `#dirty` is preserved so `start()` picks it up via the
    // initial mount-triggered flush (or the first invalidate after).
    if (!this.#running) return
    if (this.#scheduled) return
    this.#scheduled = true
    queueMicrotask(() => {
      // A `stop()` may have landed between scheduling and the
      // microtask firing; bail so we don't write to a terminal that
      // just tore down. `#dirty` stays set, so the next `start()` can
      // drain it.
      if (!this.#running) {
        this.#scheduled = false
        return
      }
      this.#dirty = false
      void this.render().finally(() => {
        this.#scheduled = false
        if (this.#dirty) this.#schedule()
      })
    })
  }

  /**
   * Render every surface once, then commit all of their writes inside a
   * single `terminal.sync(...)` block — one atomic frame for the entire
   * tree per tick. Each surface's `render(sync)` takes a capture
   * function that collects its paint closure; those run back-to-back
   * inside the outer sync after all compute phases settle.
   */
  async render(): Promise<void> {
    const paints: { paint: () => void; order: number }[] = []
    const capture =
      (order: number) =>
      (fn: () => void): void => {
        paints.push({ order, paint: fn })
      }
    // Order: stream (lowest) → ui → overlay (highest). Parallel
    // compute; the paints execute in array order under the outer sync,
    // so later surfaces land on top of earlier ones' bytes.
    await Promise.all([
      this.stream.render(capture(1)),
      this.ui.render(capture(2)),
      this.overlay.render(capture(3)),
    ])
    // Flush any side-channel transmits (e.g. KGP image data queued by
    // Image widgets during render) BEFORE entering the synced frame.
    // The terminal stores transmitted bytes globally — placements in
    // the frame body reference them by id and just need them to have
    // arrived first.
    this.terminal.flushTransmits()
    this.terminal.sync(() => {
      paints.toSorted((a, b) => a.order - b.order).forEach(({ paint }) => paint())
    })
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

/** Factory shorthand for `new Renderer(opts)`. */
export function createRenderer(opts: RendererOptions = {}): Renderer {
  return new Renderer(opts)
}
