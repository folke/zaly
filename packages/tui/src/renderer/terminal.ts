/**
 * Terminal primitive — owns stdin raw mode, stdout writes, and the
 * standard set of control modes we flip for a direct-mode renderer:
 * hide cursor, DECAWM off, DECSTBM scroll region, synchronized output.
 *
 * No rendering logic lives here; upstream surfaces (stream, ui) push
 * escape sequences through the helpers exposed below.
 */

import type { TerminalResponseEvent } from "../input/decoder.ts"

import { inspect } from "node:util"
import { isDeviceAttributesResponse, isKittyFlagsResponse } from "../input/decoder.ts"

export interface TerminalWriter {
  readonly columns: number
  readonly rows: number
  readonly isTTY?: boolean
  write: (s: string) => boolean | void
}

export interface TerminalReader {
  readonly isTTY?: boolean
  setRawMode?: (mode: boolean) => void
  ref?: () => void
  unref?: () => void
  on: (event: string, listener: (...args: unknown[]) => void) => void
  off: (event: string, listener: (...args: unknown[]) => void) => void
  resume?: () => void
  pause?: () => void
}

export type TerminalProgress = "inactive" | "progress" | "loading" | "error" | "paused"
type ProgressState = {
  type: TerminalProgress
  value?: number
}
// oxlint-disable-next-line sort-keys
const progressStates: Record<TerminalProgress, number> = {
  inactive: 0,
  progress: 1,
  error: 2,
  loading: 3,
  paused: 4,
}

export interface TerminalOpts {
  stdin?: TerminalReader
  stdout?: TerminalWriter
  /** Rows reserved at the bottom for a sticky footer (UI surface). */
  reserveBottom?: number
  /** Register SIGINT/SIGTERM/process.exit handlers. Disable for tests. */
  hookSignals?: boolean
  /** Enable alternate screen buffer. */
  altScreen?: boolean
  /** Enable SGR mouse reporting. */
  mouse?: boolean
}

type ResizeListener = (cols: number, rows: number) => void

// ESC helpers — keeping as plain string constants so greps / docs line up.
const CSI = "\x1b["
const ST = "\x1b\\"

/** @internal */
export class Terminal {
  readonly #stdout: TerminalWriter
  readonly #stdin: TerminalReader | undefined
  readonly #altScreen: boolean
  readonly #hookSignals: boolean

  #started = false
  #reserveBottom: number
  #mouse = false
  #progress: ProgressState = { type: "inactive" }
  #progressInterval: ReturnType<typeof setInterval> | undefined
  #prevRawMode: boolean | undefined
  #kittyKeyboard = false
  #kittyKeyboardPushed = false
  #modifyOtherKeys = false
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
    this.#altScreen = opts.altScreen ?? false
    this.#hookSignals = opts.hookSignals ?? true
    this.#mouse = opts.mouse ?? false
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

  get altScreen(): boolean {
    return this.#altScreen
  }

  get mouse(): boolean {
    return this.#mouse
  }

  set mouse(mouse: boolean) {
    if (this.#mouse === mouse) return
    this.#mouse = mouse
    if (!this.#started) return
    this.write(
      mouse ? `${CSI}?1002h${CSI}?1006h${CSI}?1007h` : `${CSI}?1007l${CSI}?1006l${CSI}?1002l`
    )
  }

  get kittyKeyboard(): boolean {
    return this.#kittyKeyboard
  }

  get modifyOtherKeys(): boolean {
    return this.#modifyOtherKeys
  }

  // ---------- lifecycle ----------

  /**
   * Install control-mode state: hide cursor, DECAWM off, DECSTBM scroll
   * region, stdin raw mode, SIGWINCH + SIGINT/SIGTERM hooks.
   */
  start(): void {
    if (this.#started) return
    this.#started = true
    this.#writeProgress("progress", 0)
    this.#writeProgress("inactive")

    if (this.#altScreen) this.write(`${CSI}?1049h`)

    // Cursor hidden, auto-wrap off, bracketed paste on, focus reporting on.
    // Bracketed paste (?2004) lets the decoder tell chunked pastes apart
    // from keystrokes so widgets don't run individual key handlers for
    // every character of a paste. Focus reporting (?1004) lets the
    // terminal tell us when our window gains/loses focus so we can
    // update cursor visibility, pause animations, etc.
    this.write(`${CSI}?25l${CSI}?7l${CSI}?2004h${CSI}?1004h`)
    // Enhanced keyboard reporting. Push Kitty flags, query them, then request
    // *secondary* Device Attributes as a fence: every terminal answers it, so
    // if no Kitty flags reply (`CSI ? u`) arrives before it, Kitty keyboard is
    // unsupported and we fall back to xterm modifyOtherKeys. Secondary DA
    // (not primary `CSI c`) keeps us off the primary-DA channel that the
    // image-detection queries fence on, so the two can't consume each other's
    // replies.
    this.#kittyKeyboardPushed = true
    this.write(`${CSI}>7u${CSI}?u${CSI}>c`)
    if (this.#mouse) this.write(`${CSI}?1002h${CSI}?1006h${CSI}?1007h`)
    this.#writeProgress()
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
      const onCrash = (err: unknown): void => {
        this.stop()
        const insp = process.versions.bun ? Bun.inspect : inspect
        process.stdout.write("", () => {
          process.stdout.write(insp(err, { colors: true }))
        })
      }
      process.once("uncaughtException", onCrash)
      process.once("SIGINT", bye)
      process.once("SIGTERM", bye)
      const onExit = (): void => this.stop()
      process.once("exit", onExit)
      this.#signalCleanup = () => {
        process.off("SIGINT", bye)
        process.off("SIGTERM", bye)
        process.off("exit", onExit)
        process.off("uncaughtException", onCrash)
      }
    }
  }

  handleKeyboardProtocolResponse(event: TerminalResponseEvent): boolean {
    // Ignore responses that arrive after teardown — writing enable/disable
    // sequences to an already-restored terminal would leak modes into the
    // user's shell.
    if (!this.#started || event.kind !== "csi") return false

    if (isKittyFlagsResponse(event.params, event.final)) {
      const flags = Number.parseInt(event.params.slice(1), 10)
      if (flags > 0) {
        this.#kittyKeyboard = true
        this.#disableModifyOtherKeys()
      } else {
        this.#enableModifyOtherKeys()
      }
      return true
    }

    // Only the secondary-DA reply (`CSI > … c`) is our fence. Primary-DA
    // replies (`CSI ? … c`) belong to the image-detection queries — leave
    // them for that subsystem instead of consuming them here.
    if (isDeviceAttributesResponse(event.params, event.final) && event.params.startsWith(">")) {
      if (!this.#kittyKeyboard) this.#enableModifyOtherKeys()
      return true
    }

    return false
  }

  #enableModifyOtherKeys(): void {
    if (this.#modifyOtherKeys) return
    this.write(`${CSI}>4;2m`)
    this.#modifyOtherKeys = true
  }

  #disableModifyOtherKeys(): void {
    if (!this.#modifyOtherKeys) return
    this.write(`${CSI}>4;0m`)
    this.#modifyOtherKeys = false
  }

  deleteImages(opts: { data?: boolean } = {}): void {
    if (!this.#started) return
    // Remove all Kitty images. KGP doesn't support selective deletion, so
    // this is the only way to avoid orphaned images when the renderer
    // crashes mid-paint.
    this.write(`\x1b_Ga=d,d=${(opts.data ?? true) ? "A" : "a"},q=2\x1b\\`)
  }

  /** Restore terminal modes, detach listeners. Idempotent. */
  stop(): void {
    if (!this.#started) return

    try {
      // Remove all Kitty images and taskbar/window progress state.
      this.deleteImages()
      this.setProgress()

      // Clear scroll region (if set), disable paste/focus reporting,
      // auto-wrap back on, cursor back on.
      if (this.#reserveBottom > 0) this.clearScrollRegion()
      // Wipe the visible viewport — covers both leftover footer rows
      // and any half-painted stream rows from an in-flight render that
      // was killed mid-paint (crash path). Scrollback is unaffected.
      if (this.#kittyKeyboardPushed) this.write(`${CSI}<u`)
      this.#kittyKeyboardPushed = false
      this.#kittyKeyboard = false
      this.#disableModifyOtherKeys()
      this.write(
        `${CSI}?1007l${CSI}?1006l${CSI}?1002l${CSI}?1000l${CSI}?1004l${CSI}?2004l${CSI}?7h${CSI}?25h`
      )
      if (this.#altScreen) this.write(`${CSI}?1049l`)
    } finally {
      this.#started = false
    }

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

  /** Set terminal/window progress when supported (OSC 9;4).
   *
   * - omitted / `"inactive"`: clear progress
   * - `"loading"`: indeterminate progress
   * - `"progress"`: determinate progress percentage, clamped to `0..100`
   * - `"error"` / `"paused"`: terminal-specific error/paused states with optional percentage
   */
  setProgress(state: "progress", value: number): void
  setProgress(state: "error" | "paused", value?: number): void
  setProgress(state?: "inactive" | "loading"): void
  setProgress(state?: TerminalProgress, value?: number): void {
    state ??= "inactive"

    const resetError = () => {
      this.#writeProgress("progress", 50)
      this.#writeProgress("loading")
    }
    if (this.#progress.type === "error" && state !== "error") resetError()
    if (state === "progress") this.#progress = { type: "progress", value: value ?? 0 }
    else if (state === "error" || state === "paused")
      this.#progress = { type: state, value: value ?? this.#progress.value }
    else this.#progress = { type: state }
    this.#writeProgress()
    if (state === "inactive") {
      if (this.#progressInterval) clearInterval(this.#progressInterval)
      this.#progressInterval = undefined
    } else if (!this.#progressInterval) {
      this.#progressInterval = setInterval(() => this.#writeProgress(), 100)
      this.#progressInterval.unref()
    }
  }

  #writeProgress(state?: TerminalProgress, value?: number | false): void {
    if (!this.#started) return
    value ??=
      this.#progress.value === undefined
        ? undefined
        : Math.max(0, Math.min(100, Math.round(this.#progress.value)))
    const st = progressStates[state ?? this.#progress.type]
    const seq = `\x1b]9;4;${st}${typeof value === "number" ? `;${value}` : ""}${ST}`
    this.write(seq)
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
    if (!this.#started) return
    this.#stdout.write(s)
  }

  #write(s: string): void {
    this.#stdout.write(s)
  }

  // ---------- side-channel transmit queue ----------
  //
  // Some terminal protocols separate "register data" from "place at
  // cursor" — Kitty Graphics Protocol (KGP) being the canonical
  // example: an image is transmitted once (`a=t`) and then placed
  // many times (`a=p,i=N`). The transmit bytes don't have to live
  // anywhere particular in the output stream — they just need to
  // arrive before any placement that references them.
  //
  // Routing transmit bytes through this queue (instead of inlining
  // them into rendered rows) lets the Node-level cache hold *pure
  // placement* rows: safe to cache, safe to re-splice, no stray
  // transmit ANSI surviving across paints. The renderer drains the
  // queue once per frame, before composing the frame body.

  readonly #pendingTransmits: string[] = []

  /** Queue a side-channel ANSI payload (KGP transmit, etc.) for the
   *  next `flushTransmits()`. No-op for empty strings. */
  enqueueTransmit(seq: string): void {
    if (seq) this.#pendingTransmits.push(seq)
  }

  /** Drain the transmit queue. Called by the renderer at the start of
   *  each paint, before frame composition. Idempotent when empty. */
  flushTransmits(): void {
    if (this.#pendingTransmits.length === 0) return
    this.#stdout.write(this.#pendingTransmits.join(""))
    this.#pendingTransmits.length = 0
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

  /**
   * Scroll the scroll region down by `n` rows (SD). Top `n` rows become
   * blank, existing content shifts down, bottom `n` rows fall off the
   * region (they don't move to scrollback — scrollback is a top-side
   * concept; SD's displaced rows are simply lost).
   */
  scrollDown(n: number): string {
    return n > 0 ? `${CSI}${n}T` : ""
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
    if (!this.#started) return
    this.write(`${CSI}?2026h`)
    try {
      fn()
    } finally {
      this.#write(`${CSI}?2026l`)
    }
  }

  // ---------- resize events ----------

  onResize(fn: ResizeListener): () => void {
    this.#resizeListeners.add(fn)
    return () => this.#resizeListeners.delete(fn)
  }
}
