import type { BaseState, RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { Color } from "../style/color.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { stringWidth } from "../style/ansi.ts"

/**
 * Frame sets from the common terminal-spinner vocabulary. Pick one to taste.
 * @internal
 */
export const spinnerFrames = {
  arrow: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  bouncingBar: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[ ===]", "[  ==]", "[   =]", "[    ]"],
  circle: ["◐", "◓", "◑", "◒"],
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  line: ["-", "\\", "|", "/"],
} as const

export type SpinnerStyle = keyof typeof spinnerFrames

export interface SpinnerState extends BaseState {
  /** Frame glyphs, cycled in order. Defaults to `dots`. */
  frames?: SpinnerStyle | readonly string[]
  /** Milliseconds per frame. Defaults to 80. */
  speed?: number
  /** Foreground theme slot or explicit color. Defaults to `primary`. */
  color?: Color
  /** Whether the animation is ticking. Defaults to `true`. Accepts a
   *  signal accessor so callers can drive the spinner from shared
   *  reactive state. Setting `false` stops the interval; setting
   *  `true` restarts it. */
  running?: Reactive<boolean>
}

/**
 * An animated spinner. Its *frame* is always a pure function of wall
 * time and `speed`:
 *
 * ```ts
 * const idx = Spinner.tick(speed) % frames.length
 * ```
 *
 * That means the visible frame only depends on how much time has
 * actually elapsed, never on how often you happen to render. Two
 * spinners with the same `speed` stay in lockstep even if only one of
 * them gets invalidated.
 *
 * Each spinner owns an `unref()`'d interval that invalidates it at
 * `speed` cadence; the interval auto-starts on first render so you
 * don't have to remember a `.start()` call. Forgetting to `.stop()`
 * is harmless — the unref'd timer doesn't pin the event loop.
 */
export class Spinner extends Node<SpinnerState> {
  #timer?: ReturnType<typeof setInterval>

  constructor(state: SpinnerState) {
    super(state)
    // Timer lifecycle is driven by state: `_render` reconciles the
    // interval on every render, and we reconcile on mount too so a
    // spinner that's never rendered (tests, offscreen trees) still
    // obeys its `running` flag. Unmount always clears.
    this.on("mount", () => this.#reconcile())
    this.on("unmount", () => this.#stopTimer())
  }

  /** Global tick index for a given `speed`. Shared across all callers. */
  static tick(speed: number): number {
    return Math.floor(performance.now() / speed)
  }

  /** Shorthand for `setState({ running: true })`. */
  start(): this {
    return this.setState({ running: true })
  }

  /** Shorthand for `setState({ running: false })`. */
  stop(): this {
    return this.setState({ running: false })
  }

  #startTimer(): void {
    if (this.#timer !== undefined) return
    const speed = this.state.speed ?? 80
    this.#timer = setInterval(() => this.invalidate(), speed)
    // Don't pin the event loop — a forgotten spinner should never
    // prevent the process from exiting.
    this.#timer.unref()
  }

  #stopTimer(): void {
    if (this.#timer === undefined) return
    clearInterval(this.#timer)
    this.#timer = undefined
  }

  /** Sync the interval to the current `running` state. Reading through
   *  `unwrap` during a render subscribes the spinner to a signal
   *  accessor so flips from elsewhere in the app retrigger this. */
  #reconcile(): void {
    const running = unwrap(this.state.running ?? true)
    if (running) this.#startTimer()
    else this.#stopTimer()
  }

  protected _render(ctx: RenderCtx): string[] {
    this.#reconcile()

    const f = this.state.frames
    const frames = (typeof f === "string" ? spinnerFrames[f] : f) ?? spinnerFrames.dots
    const frame = frames[Spinner.tick(this.state.speed ?? 80) % frames.length]
    // When stopped, hold the slot open with blank space of the same
    // cell width so surrounding layout doesn't jump as the spinner
    // toggles. Stable-width frame sets (dots, line, circle) look the
    // same; variable sets (bouncingBar) pick the longest frame's
    // width so stops after a short frame still hold full space.
    if (!unwrap(this.state.running ?? true)) return [" ".repeat(stringWidth(frame))]
    const color = this.state.color ?? "primary"
    return [ctx.style.fg(color)(frame)]
  }
}

/**
 * Factory for `Spinner`. All options are optional — a bare `spinner()`
 * gives you the braille `dots` set at 80ms in the theme's `primary` color.
 */
export function spinner(state: SpinnerState = {}): Spinner {
  return new Spinner(state)
}
