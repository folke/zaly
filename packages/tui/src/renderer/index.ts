import type { RenderCtx, Theme } from "../core/ctx.ts"
import type { TerminalReader, TerminalWriter } from "./terminal.ts"
import type { UIOptions } from "./ui.ts"

import { createCtx } from "../core/ctx.ts"
import { Stream } from "./stream.ts"
import { Terminal } from "./terminal.ts"
import { UI } from "./ui.ts"

export { Stream } from "./stream.ts"
export { Terminal } from "./terminal.ts"
export { UI } from "./ui.ts"

export interface RendererOptions {
  stdin?: TerminalReader
  stdout?: TerminalWriter
  theme?: Theme
  /** Upper bound on footer height (default: viewport / 3). */
  uiMaxHeight?: number
  /** Register SIGINT/SIGTERM cleanup (default: true). Disable in tests. */
  hookSignals?: boolean
}

export interface Renderer {
  readonly stream: Stream
  readonly ui: UI
  readonly terminal: Terminal
  start(): void
  stop(): void
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

  // SIGWINCH: size changed. Force a full repaint of both surfaces.
  terminal.onResize(() => {
    ui.invalidate()
    // Stream's cached `writtenRows` accounts for what's on screen at
    // the OLD size. Clearing it forces the next flush to rewrite the
    // whole visible slice at the new geometry.
    stream.reset()
  })

  return {
    start: () => terminal.start(),
    stop: () => terminal.stop(),
    stream,
    terminal,
    ui,
  }
}
