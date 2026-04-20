import type { RenderCtx, Theme } from "../core/ctx.ts"
import type { Node } from "../core/node.ts"
import type { TerminalReader, TerminalWriter } from "./terminal.ts"
import type { UIOptions } from "./ui.ts"

import { createCtx } from "../core/ctx.ts"
import { Decoder } from "../input/decoder.ts"
import { InputRouter } from "../input/router.ts"
import { Stream } from "./stream.ts"
import { Terminal } from "./terminal.ts"
import { UI } from "./ui.ts"

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
  readonly terminal: Terminal
  readonly input: InputRouter

  readonly #decoder = new Decoder()
  readonly #stdin: TerminalReader & { setEncoding?: (enc: string) => void }
  #running = false
  #escTimer: ReturnType<typeof setTimeout> | undefined
  #scheduled = false
  #dirty = false
  readonly #onDirty = (): void => this.#schedule()

  constructor(opts: RendererOptions = {}) {
    this.terminal = new Terminal({
      hookSignals: opts.hookSignals,
      stdin: opts.stdin,
      stdout: opts.stdout,
    })

    const theme = opts.theme
    const getCtx = (): RenderCtx => createCtx({ theme, width: this.terminal.cols })

    const uiOpts: UIOptions = {}
    if (opts.uiMaxHeight !== undefined) uiOpts.maxHeight = opts.uiMaxHeight

    this.ui = new UI(this.terminal, getCtx, uiOpts)
    this.stream = new Stream(this.terminal, getCtx)
    this.input = new InputRouter()

    // Surfaces emit `"dirty"` instead of self-scheduling. Centralising
    // the microtask here means one flush per tick for the whole tree and
    // lets future surfaces (overlay) slot in with a single `.on("dirty")`.
    this.ui.on("dirty", this.#onDirty)
    this.stream.on("dirty", this.#onDirty)

    // SIGWINCH: size changed. Force a full repaint of both surfaces.
    this.terminal.onResize(() => {
      this.ui.invalidate()
      // Stream's cached `writtenRows` accounts for what's on screen at
      // the OLD size. Clearing it forces the next flush to rewrite the
      // whole visible slice at the new geometry.
      this.stream.reset()
    })

    this.#stdin = (opts.stdin ?? (process.stdin as unknown as TerminalReader)) as TerminalReader & {
      setEncoding?: (enc: string) => void
    }
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
    const paints: Array<() => void> = []
    const capture = (fn: () => void): void => {
      paints.push(fn)
    }
    // Order: stream (lowest), ui (above stream). Overlay slots in here
    // once it exists. Parallel compute; the paints execute in array
    // order under the outer sync.
    await Promise.all([this.stream.render(capture), this.ui.render(capture)])
    this.terminal.sync(() => {
      for (const paint of paints) paint()
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
