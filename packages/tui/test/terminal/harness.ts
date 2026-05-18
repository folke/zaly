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
import { readFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { Renderer } from "../../src/renderer/renderer.ts"

// Resolve the .wasm path relative to the ghostty-web package. Works
// through Bun's symlinked node_modules layout too — `require.resolve`
// follows the package's entry, which sits next to the wasm file.
const require = createRequire(import.meta.url)
const wasmPath = new URL("../ghostty-vt.wasm", new URL(`file://${require.resolve("ghostty-web")}`))
  .pathname

// We instantiate the WASM ourselves and hand the instance to the
// `Ghostty` constructor rather than going through `Ghostty.load(path)`.
// Upstream's `loadFromPath` calls `fetch(path)` as its last fallback;
// under Node (both vitest and plain `node`), `fetch` on a bare file
// path — or even `file://` URL, up through Node 25 — fails with
// `ERR_INVALID_URL` / "fetch file:// not implemented". Reading the
// bytes directly keeps the harness runnable in both Bun and Node.
let ghostty: Ghostty | undefined
async function loadGhostty(): Promise<Ghostty> {
  if (ghostty !== undefined) return ghostty
  const bytes = await readFile(wasmPath)
  const module_ = await WebAssembly.compile(bytes)
  // The `env.log` import closes over `instance` to reach `memory` for
  // decoding the logged UTF-8 slice. This matches upstream's
  // loadFromPath wiring verbatim — keeping behaviour identical means
  // the same parser runs under both runtimes.
  // oxlint-disable-next-line prefer-const
  let instance: WebAssembly.Instance | undefined
  instance = await WebAssembly.instantiate(module_, {
    env: {
      log: (ptr: number, len: number) => {
        if (instance === undefined) return
        const mem = (instance.exports as { memory: WebAssembly.Memory }).memory
        const data = new Uint8Array(mem.buffer, ptr, len)
        console.log("[ghostty-vt]", new TextDecoder().decode(data))
      },
    },
  })
  ghostty = new Ghostty(instance)
  return ghostty
}

export interface HarnessOpts {
  cols?: number
  rows?: number
  /** Scrollback capacity in lines. Default: 1000. */
  scrollback?: number
  /** Rows reserved at the bottom for the UI surface. Default: 0. */
  uiMaxHeight?: number
  /** Forwarded to `Stream` — baseline footer height for the commit
   *  threshold. Default: 0. */
  fixedFooterHeight?: number
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
  /**
   * Resize the simulated terminal and fire SIGWINCH so the renderer's
   * resize handler runs. Waits for the scheduled flush to settle.
   */
  resize(cols: number, rows: number): Promise<void>
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
  for (let i = 0; i < 64; i++) await Promise.resolve()
}

/** Build a harness. Async because we need to load the WASM on first call. */
export async function makeHarness(opts: HarnessOpts = {}): Promise<Harness> {
  let cols = opts.cols ?? 40
  let rows = opts.rows ?? 10

  const g = await loadGhostty()
  const term = g.createTerminal(cols, rows, { scrollbackLimit: opts.scrollback ?? 1000 })

  // Stdout: route every byte our Renderer writes into the parser.
  // `columns`/`rows` are getters (not fixed properties) so the harness's
  // `resize()` sees new values instantly without re-wiring — the Terminal
  // reads them on every access via its own getters.
  const stdout: TerminalWriter = {
    get columns(): number {
      return cols
    },
    isTTY: true,
    get rows(): number {
      return rows
    },
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
    fixedFooterHeight: opts.fixedFooterHeight,
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

  const resize = async (newCols: number, newRows: number): Promise<void> => {
    cols = newCols
    rows = newRows
    term.resize(newCols, newRows)
    // Terminal listens via `process.on("SIGWINCH", ...)`, so poking
    // process's EventEmitter triggers the renderer's handler. The
    // handler emits `dirty` on the surfaces, which schedules a render.
    void process.emit("SIGWINCH")
    await flush()
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

  return { dispose, flush, renderer, resize, row, scrollback, term, viewport }
}
