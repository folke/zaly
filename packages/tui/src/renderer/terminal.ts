/**
 * Terminal primitive — owns stdin raw mode, stdout writes, and the
 * standard set of control modes we flip for a direct-mode renderer:
 * hide cursor, DECAWM off, DECSTBM scroll region, synchronized output.
 *
 * No rendering logic lives here; upstream surfaces (stream, ui) push
 * escape sequences through the helpers exposed below.
 */

export interface TerminalWriter {
  readonly columns: number
  readonly rows: number
  readonly isTTY?: boolean
  write(s: string): boolean | void
}

export interface TerminalReader {
  readonly isTTY?: boolean
  setRawMode?(mode: boolean): void
  ref?(): void
  unref?(): void
  on(event: string, listener: (...args: unknown[]) => void): void
  off(event: string, listener: (...args: unknown[]) => void): void
  resume?(): void
  pause?(): void
}

export interface TerminalOpts {
  stdin?: TerminalReader
  stdout?: TerminalWriter
  /** Rows reserved at the bottom for a sticky footer (UI surface). */
  reserveBottom?: number
  /** Register SIGINT/SIGTERM/process.exit handlers. Disable for tests. */
  hookSignals?: boolean
}

type ResizeListener = (cols: number, rows: number) => void

// ESC helpers — keeping as plain string constants so greps / docs line up.
const CSI = "\x1b["
const ESC = "\x1b"

export class Terminal {
  readonly #stdout: TerminalWriter
  readonly #stdin: TerminalReader | undefined
  readonly #hookSignals: boolean

  #started = false
  #reserveBottom: number
  #prevRawMode: boolean | undefined
  #resizeListeners = new Set<ResizeListener>()
  #signalCleanup: (() => void) | undefined
  #onResize = (): void => {
    // stdout.columns/rows update in place on SIGWINCH; re-emit.
    for (const l of this.#resizeListeners) l(this.cols, this.rows)
  }

  constructor(opts: TerminalOpts = {}) {
    this.#stdout = opts.stdout ?? (process.stdout as unknown as TerminalWriter)
    this.#stdin = opts.stdin ?? (process.stdin as unknown as TerminalReader)
    this.#reserveBottom = opts.reserveBottom ?? 0
    this.#hookSignals = opts.hookSignals ?? true
  }

  /** Current terminal columns (number of cells wide). */
  get cols(): number {
    return this.#stdout.columns || 80
  }

  /** Current terminal rows (number of cells tall). */
  get rows(): number {
    return this.#stdout.rows || 24
  }

  /** Rows reserved at the bottom for the footer. */
  get reserveBottom(): number {
    return this.#reserveBottom
  }

  /** Bottom row of the scroll region (1-based, inclusive). */
  get scrollBottom(): number {
    return Math.max(1, this.rows - this.#reserveBottom)
  }

  /** Top row of the footer (1-based, inclusive). 0 when no footer. */
  get footerTop(): number {
    return this.#reserveBottom > 0 ? this.rows - this.#reserveBottom + 1 : 0
  }

  // ---------- lifecycle ----------

  /**
   * Install control-mode state: hide cursor, DECAWM off, DECSTBM scroll
   * region, stdin raw mode, SIGWINCH + SIGINT/SIGTERM hooks.
   */
  start(): void {
    if (this.#started) return
    this.#started = true

    // Cursor hidden, auto-wrap off.
    this.write(`${CSI}?25l${CSI}?7l`)
    // Scroll region set to [1, scrollBottom]. Terminals default to the
    // full viewport, so omitting `reserveBottom = 0` is a no-op.
    if (this.#reserveBottom > 0) this.setScrollRegion(1, this.scrollBottom)

    // stdin → raw mode for the input-routing layer that'll land next.
    // We deliberately do NOT call stdin.resume() here: nothing in the
    // renderer reads keystrokes yet, and keeping stdin in the flowing
    // state pins the Node/Bun event loop open so the process can't
    // exit naturally. The input module will resume() when it wires a
    // reader, and pause() when it unwires.
    if (this.#stdin?.isTTY && typeof this.#stdin.setRawMode === "function") {
      this.#prevRawMode = Boolean((this.#stdin as { isRaw?: boolean }).isRaw)
      this.#stdin.setRawMode(true)
    }

    // Resize listener.
    process.on("SIGWINCH", this.#onResize)

    // Graceful shutdown.
    if (this.#hookSignals) {
      const bye = (): void => {
        this.stop()
        process.exit(0)
      }
      process.once("SIGINT", bye)
      process.once("SIGTERM", bye)
      const onExit = (): void => this.stop()
      process.once("exit", onExit)
      this.#signalCleanup = () => {
        process.off("SIGINT", bye)
        process.off("SIGTERM", bye)
        process.off("exit", onExit)
      }
    }
  }

  /** Restore terminal modes, detach listeners. Idempotent. */
  stop(): void {
    if (!this.#started) return
    this.#started = false

    // Clear scroll region (if set), auto-wrap back on, cursor back on.
    if (this.#reserveBottom > 0) this.clearScrollRegion()
    this.write(`${CSI}?7h${CSI}?25h`)

    if (this.#stdin?.isTTY && typeof this.#stdin.setRawMode === "function") {
      this.#stdin.setRawMode(this.#prevRawMode ?? false)
      // Belt-and-braces: pause stdin in case the input layer left it
      // flowing. Keeps the event loop free to exit.
      this.#stdin.pause?.()
    }

    process.off("SIGWINCH", this.#onResize)
    this.#signalCleanup?.()
    this.#signalCleanup = undefined
  }

  /** Change the bottom reservation and re-apply the scroll region. */
  setReserveBottom(rows: number): void {
    const next = Math.max(0, Math.min(rows, this.rows - 1))
    if (next === this.#reserveBottom) return
    this.#reserveBottom = next
    if (!this.#started) return
    if (next > 0) this.setScrollRegion(1, this.scrollBottom)
    else this.clearScrollRegion()
  }

  // ---------- output helpers ----------

  /** Low-level write. Use escape helpers + this to emit sequences. */
  write(s: string): void {
    this.#stdout.write(s)
  }

  /** Absolute cursor move (1-based). */
  moveTo(row: number, col = 1): string {
    return `${CSI}${row};${col}H`
  }

  /** Erase the entire line the cursor is on. */
  clearLine(): string {
    return `${CSI}2K`
  }

  /** Clear from cursor to end of screen. */
  clearBelow(): string {
    return `${CSI}0J`
  }

  /** Scroll the scroll region up by `n` rows (SU). Top rows enter scrollback. */
  scrollUp(n: number): string {
    return n > 0 ? `${CSI}${n}S` : ""
  }

  /** Delete `n` lines at the cursor, pulling content below upward (DL). */
  deleteLines(n: number): string {
    return n > 0 ? `${CSI}${n}M` : ""
  }

  /** Set the scroll region (DECSTBM), 1-based inclusive. */
  setScrollRegion(top: number, bottom: number): void {
    this.write(`${CSI}${top};${bottom}r`)
  }

  /** Reset to the full-viewport scroll region. */
  clearScrollRegion(): void {
    this.write(`${CSI}r`)
  }

  /**
   * Wrap a block of writes in begin/end-synchronized-update. Supporting
   * terminals buffer the enclosed bytes and paint atomically — eliminates
   * flicker on multi-row diff rewrites. Unsupported terminals ignore
   * both escapes, so there's no downside.
   */
  sync(fn: () => void): void {
    this.write(`${CSI}?2026h`)
    try {
      fn()
    } finally {
      this.write(`${CSI}?2026l`)
    }
  }

  // ---------- resize events ----------

  onResize(fn: ResizeListener): () => void {
    this.#resizeListeners.add(fn)
    return () => this.#resizeListeners.delete(fn)
  }
}

export { CSI, ESC }
