import type { RenderCtx, Theme } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { TerminalReader, TerminalWriter } from "./terminal.ts"
import type { UIOptions } from "./ui.ts"

import { createCtx } from "../core/ctx.ts"
import { Decoder } from "../input/decoder.ts"
import { InputRouter } from "../input/router.ts"
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
}

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

    // Surfaces emit `"dirty"` instead of self-scheduling. Centralising
    // the microtask here means one flush per tick for the whole tree
    // and keeps paint order explicit: stream < ui < overlay.
    this.stream.on("dirty", this.#onDirty)
    this.ui.on("dirty", this.#onDirty)
    this.overlay.on("dirty", this.#onDirty)

    // SIGWINCH: size changed. Bump the ctx version so every node's
    // cache self-invalidates on the next render; clear `#ctx` so the
    // next getCtx rebuilds against the new width. Then force the
    // stream + UI surfaces to repaint.
    this.terminal.onResize(() => {
      this.#ctxVersion++
      this.#ctx = undefined
      this.ui.invalidate()
      this.stream.reset()
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

  start(): void {
    if (this.#running) return
    this.#running = true
    this.terminal.start()
    this.#stdin.setEncoding?.("utf8")
    this.#stdin.on("data", this.#onData)
    this.#stdin.resume?.()
  }

  stop(): void {
    if (!this.#running) return
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
      if (n.id !== id) return undefined
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

  #schedule(): void {
    this.#dirty = true
    if (this.#scheduled) return
    this.#scheduled = true
    queueMicrotask(() => {
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
