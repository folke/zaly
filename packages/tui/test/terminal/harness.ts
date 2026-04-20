/**
 * ghostty-web-powered integration harness for @zaly/tui.
 *
 * Drives the WASM VT parser directly via `Ghostty.createTerminal()` —
 * no DOM, no canvas, no render loop. We only care about the buffer the
 * parser produces in response to our Renderer's stdout bytes, so the
 * `Terminal`/`CanvasRenderer` classes from ghostty-web (which need an
 * HTMLCanvasElement) are bypassed entirely.
 *
 * Exposes primitives for asserting on the visible viewport, scrollback,
 * and individual rows.
 */

import type { GhosttyCell, GhosttyTerminal } from "ghostty-web"
import type { TerminalReader, TerminalWriter } from "../../src/renderer/terminal.ts"

import { Ghostty } from "ghostty-web"
import { createRequire } from "node:module"
import { Renderer } from "../../src/renderer/index.ts"

// Resolve the .wasm path relative to the ghostty-web package. Works
// through Bun's symlinked node_modules layout too — `require.resolve`
// follows the package's entry, which sits next to the wasm file.
const require = createRequire(import.meta.url)
const wasmPath = new URL("../ghostty-vt.wasm", new URL(`file://${require.resolve("ghostty-web")}`))
  .pathname

// Load the WASM once for the whole test process. `Ghostty.load` is
// idempotent from our perspective (we cache the promise).
let ghostty: Awaited<ReturnType<typeof Ghostty.load>> | undefined
async function loadGhostty(): Promise<NonNullable<typeof ghostty>> {
  ghostty ??= await Ghostty.load(wasmPath)
  return ghostty
}

export interface HarnessOpts {
  cols?: number
  rows?: number
  /** Scrollback capacity in lines. Default: 1000. */
  scrollback?: number
  /** Rows reserved at the bottom for the UI surface. Default: 0. */
  uiMaxHeight?: number
}

export interface Harness {
  readonly renderer: Renderer
  readonly term: GhosttyTerminal
  /** The visible rows [top → bottom], trimmed on the right. */
  viewport(): string[]
  /** All lines that have scrolled off the top. Oldest first. */
  scrollback(): string[]
  /** A single visible row (0-based from top of viewport). */
  row(i: number): string
  /** Wait for any pending microtasks (state mutations → flush). */
  flush(): Promise<void>
  /** Tear down the renderer and the terminal. */
  dispose(): void
}

const rowToString = (cells: GhosttyCell[]): string => {
  let s = ""
  for (const cell of cells) {
    if (cell.width === 0) continue // combining — already folded into prev
    s += cell.codepoint === 0 ? " " : String.fromCodePoint(cell.codepoint)
  }
  return s.replace(/ +$/, "")
}

const flush = async (): Promise<void> => {
  // Drain microtasks — a full render tick chains through many awaits
  // (Promise.all across surfaces, each surface awaiting child nodes,
  // plus shiki/image pipelines). 8 isn't enough for a multi-surface
  // render with overlays; 64 is generous and still free-fast.
  // oxlint-disable-next-line no-await-in-loop
  for (let i = 0; i < 64; i++) await Promise.resolve()
}

/** Build a harness. Async because we need to load the WASM on first call. */
export async function makeHarness(opts: HarnessOpts = {}): Promise<Harness> {
  const cols = opts.cols ?? 40
  const rows = opts.rows ?? 10

  const g = await loadGhostty()
  const term = g.createTerminal(cols, rows, { scrollbackLimit: opts.scrollback ?? 1000 })

  // Stdout: route every byte our Renderer writes into the parser.
  const stdout: TerminalWriter = {
    columns: cols,
    isTTY: true,
    rows,
    write(s: string): boolean {
      term.write(s)
      return true
    },
  }

  // Stdin: no-op for now — harness currently only exercises the output
  // path. Expand when we need synthetic key events.
  const stdin: TerminalReader = {
    isTTY: true,
    off() {},
    on() {},
    pause() {},
    resume() {},
    setRawMode() {},
  }

  const renderer = new Renderer({
    hookSignals: false,
    stdin,
    stdout,
    uiMaxHeight: opts.uiMaxHeight,
  })
  renderer.start()

  const viewport = (): string[] => {
    const out: string[] = []
    for (let y = 0; y < rows; y++) {
      const cells = term.getLine(y)
      out.push(cells ? rowToString(cells) : "")
    }
    return out
  }

  const scrollback = (): string[] => {
    const len = term.getScrollbackLength()
    const out: string[] = []
    for (let i = 0; i < len; i++) {
      const cells = term.getScrollbackLine(i)
      out.push(cells ? rowToString(cells) : "")
    }
    return out
  }

  const row = (i: number): string => viewport()[i]

  const dispose = (): void => {
    renderer.stop()
    term.free()
  }

  return { dispose, flush, renderer, row, scrollback, term, viewport }
}
