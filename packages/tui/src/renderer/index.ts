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

/** Visitor signature for `renderer.walk`. Return `"stop"` to halt. */
export type NodeVisitor = (node: Node) => void | "stop"

export interface Renderer {
  readonly stream: Stream
  readonly ui: UI
  readonly terminal: Terminal
  readonly input: InputRouter
  start(): void
  stop(): void
  /** Look up a node by its `id`. Returns `undefined` if nothing matches. */
  getNode(id: string): Node | undefined
  /**
   * Find every node matching a predicate. When passed a string, it's
   * interpreted as `node.type === string` — the common "find all
   * Inputs" case. For anything richer, pass a function.
   */
  findNode(match: string | ((node: Node) => boolean)): Node[]
  /**
   * Walk every node in the combined stream + UI tree, depth-first,
   * parents before children. Return `"stop"` from the visitor to halt.
   */
  walk(visit: NodeVisitor): void
}

/**
 * Build a renderer wiring a `Terminal` primitive with the `Stream` and
 * `UI` surfaces. The renderer doesn't render anything until you either
 * append to `renderer.stream` or add children to `renderer.ui.root`.
 *
 * ```ts
 * const renderer = createRenderer()
 * renderer.start()
 * renderer.stream.append(text("hello"))
 * renderer.ui.root.add(input({ placeholder: "> " }))
 * // ... later
 * renderer.stop()
 * ```
 */
export function createRenderer(opts: RendererOptions = {}): Renderer {
  const terminal = new Terminal({
    hookSignals: opts.hookSignals,
    stdin: opts.stdin,
    stdout: opts.stdout,
  })

  const theme = opts.theme
  const getCtx = (): RenderCtx => createCtx({ theme, width: terminal.cols })

  const uiOpts: UIOptions = {}
  if (opts.uiMaxHeight !== undefined) uiOpts.maxHeight = opts.uiMaxHeight

  const ui = new UI(terminal, getCtx, uiOpts)
  const stream = new Stream(terminal, getCtx)
  const input = new InputRouter()
  const decoder = new Decoder()

  // SIGWINCH: size changed. Force a full repaint of both surfaces.
  terminal.onResize(() => {
    ui.invalidate()
    // Stream's cached `writtenRows` accounts for what's on screen at
    // the OLD size. Clearing it forces the next flush to rewrite the
    // whole visible slice at the new geometry.
    stream.reset()
  })

  // stdin wiring. In raw mode the terminal delivers bytes directly —
  // including ctrl-c as 0x03 rather than SIGINT — so we decode here and
  // hand events off to the router.
  const stdin = (opts.stdin ?? (process.stdin as unknown as TerminalReader)) as TerminalReader & {
    setEncoding?: (enc: string) => void
  }
  let escTimer: ReturnType<typeof setTimeout> | undefined
  const onData = (chunk: unknown): void => {
    // stdin may deliver strings (when setEncoding was called) or Buffers.
    const text = typeof chunk === "string" ? chunk : String(chunk)
    for (const ev of decoder.feed(text)) input.dispatch(ev)
    // Any pending `\x1b` will hang in the decoder until more bytes
    // arrive. Schedule a short timer so a lone ESC keypress commits as
    // an `esc` event rather than waiting indefinitely.
    if (escTimer !== undefined) clearTimeout(escTimer)
    escTimer = setTimeout(() => {
      escTimer = undefined
      for (const ev of decoder.flush()) input.dispatch(ev)
    }, 25)
    escTimer.unref()
  }

  let running = false
  const walk = (visit: NodeVisitor): void => {
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
    visitNode(ui.root)
    for (const n of stream.nodes) visitNode(n)
  }
  const getNode = (id: string): Node | undefined => {
    let found: Node | undefined
    walk((n) => {
      if (n.id === id) {
        found = n
        return "stop"
      }
    })
    return found
  }
  const findNode = (match: string | ((node: Node) => boolean)): Node[] => {
    const pred = typeof match === "string" ? (n: Node): boolean => n.type === match : match
    const out: Node[] = []
    walk((n) => {
      if (pred(n)) out.push(n)
    })
    return out
  }

  const renderer: Renderer = {
    findNode,
    getNode,
    input,
    start: () => {
      if (running) return
      running = true
      terminal.start()
      stdin.setEncoding?.("utf8")
      stdin.on("data", onData)
      stdin.resume?.()
    },
    stop: () => {
      if (!running) return
      running = false
      stdin.off("data", onData)
      stdin.pause?.()
      if (escTimer !== undefined) {
        clearTimeout(escTimer)
        escTimer = undefined
      }
      terminal.stop()
    },
    stream,
    terminal,
    ui,
    walk,
  }

  return renderer
}
