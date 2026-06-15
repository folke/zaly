import type { RenderCtx } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { AnyStyle } from "../style/types.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { Node } from "../core/node.ts"
import { effect, untrack, unwrap } from "../core/reactive.ts"

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

export interface SpinnerState {
  /** Frame glyphs, cycled in order. Defaults to `dots`. */
  frames?: SpinnerStyle | readonly string[]
  /** Foreground theme slot or explicit color. Defaults to `primary`. */
  color?: Reactive<AnyStyle>
  /** Whether the animation is ticking. Defaults to `true`. Accepts a
   *  signal accessor so callers can drive the spinner from shared
   *  reactive state. Setting `false` stops the interval; setting
   *  `true` restarts it. */
  running?: Reactive<boolean>
  idle?: string
}

const SPEED = 80

class Animator {
  #timer?: ReturnType<typeof setInterval>
  #spinners = new Set<Spinner>()

  #start(): void {
    if (this.#timer !== undefined) return
    // `untracked` so the interval callback doesn't inherit the render's tracking ctx.
    this.#timer = untrack(() =>
      setInterval(() => this.#spinners.forEach((s) => s.invalidate()), SPEED)
    )
    // Don't pin the event loop — a forgotten spinner should never
    // prevent the process from exiting.
    this.#timer.unref()
  }

  #stop(): void {
    if (this.#timer === undefined) return
    clearInterval(this.#timer)
    this.#timer = undefined
  }

  add(node: Spinner) {
    if (this.#spinners.has(node)) return
    this.#spinners.add(node)
    this.#start()
  }

  del(node: Spinner) {
    if (!this.#spinners.has(node)) return
    this.#spinners.delete(node)
    if (this.#spinners.size === 0) this.#stop()
  }
}

const animator = new Animator()

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
 * Each spinner owns an `unref()`'d interval while it is mounted,
 * visible, and running. The interval is reconciled from reactive
 * state/lifecycle, not from `_render`, so hiding a spinner stops it
 * even though invisible nodes skip rendering. Forgetting to `.stop()`
 * is harmless — the unref'd timer doesn't pin the event loop.
 */
export class Spinner extends Node<SpinnerState> {
  constructor(state: SpinnerState) {
    super(state)
    // Timer lifecycle is driven by mount + reactive state, not `_render`:
    // invisible nodes skip rendering, but still need their interval stopped.
    // Unmount always clears.
    this.on("mount", () => this.#check())
    this.on("unmount", () => animator.del(this))

    effect(() => this.#check())
  }

  /** Global tick index for a given `speed`. Shared across all callers. */
  static tick(speed: number): number {
    return Math.floor(performance.now() / speed)
  }

  /** Shorthand for `state.set({ running: true })`. */
  start(): this {
    this.state.set({ running: true })
    return this
  }

  /** Shorthand for `state.set({ running: false })`. */
  stop(): this {
    this.state.set({ running: false })
    return this
  }

  /** Sync the interval to the current `running` state. Reading through
   *  `unwrap` during a render subscribes the spinner to a signal
   *  accessor so flips from elsewhere in the app retrigger this. */
  #check(): void {
    const enabled = unwrap(this.state.running ?? true) && this.visible && this.mounted // track
    if (!enabled) return animator.del(this)
    animator.add(this)
  }

  protected _render(ctx: RenderCtx): string[] {
    const f = this.state.frames
    const frames = (typeof f === "string" ? spinnerFrames[f] : f) ?? spinnerFrames.dots
    let frame = frames[Spinner.tick(SPEED) % frames.length]
    // When stopped, hold the slot open with blank space of the same
    // cell width so surrounding layout doesn't jump as the spinner
    // toggles. Stable-width frame sets (dots, line, circle) look the
    // same; variable sets (bouncingBar) pick the longest frame's
    // width so stops after a short frame still hold full space.
    if (!unwrap(this.state.running ?? true))
      frame = (this.state.idle ?? " ").repeat(stringWidth(frame))
    const color = this.state.color ?? "primary"
    return [ctx.style.add(unwrap(color))(frame)]
  }
}

/**
 * Factory for `Spinner`. All options are optional — a bare `spinner()`
 * gives you the braille `dots` set at 80ms in the theme's `primary` color.
 */
export function spinner(state: State<SpinnerState> = {}): Spinner {
  return new Spinner(state)
}
