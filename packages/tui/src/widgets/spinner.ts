import type { BaseState, RenderCtx } from "../core/ctx.ts"
import type { Color } from "../style/color.ts"

import { Node } from "../core/node.ts"

/** Frame sets from the common terminal-spinner vocabulary. Pick one to taste. */
export const spinnerFrames = {
  arrow: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
  bouncingBar: ["[    ]", "[=   ]", "[==  ]", "[=== ]", "[ ===]", "[  ==]", "[   =]", "[    ]"],
  circle: ["◐", "◓", "◑", "◒"],
  dots: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  line: ["-", "\\", "|", "/"],
} as const

export interface SpinnerState extends BaseState {
  /** Frame glyphs, cycled in order. Defaults to `dots`. */
  frames?: readonly string[]
  /** Milliseconds per frame. Defaults to 80. */
  speed?: number
  /** Foreground theme slot or explicit color. Defaults to `primary`. */
  color?: Color
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
// eslint-disable-next-line typescript-eslint/no-unnecessary-type-arguments -- explicit SpinnerState is load-bearing for `this.state`.
export class Spinner extends Node<SpinnerState> {
  #timer?: ReturnType<typeof setInterval>

  constructor(state: SpinnerState) {
    super(state)
    this.on("mount", () => this.start())
    this.on("unmount", () => this.stop())
  }

  /** Global tick index for a given `speed`. Shared across all callers. */
  static tick(speed: number): number {
    return Math.floor(performance.now() / speed)
  }

  /** Start the auto-invalidate interval. Idempotent; unref'd. */
  start(): this {
    if (this.#timer !== undefined) return this
    const speed = this.state.speed ?? 80
    this.#timer = setInterval(() => this.invalidate(), speed)
    // Don't pin the event loop — a forgotten spinner should never
    // prevent the process from exiting.
    this.#timer.unref()
    return this
  }

  /** Stop the auto-invalidate interval. Idempotent. */
  stop(): this {
    if (this.#timer === undefined) return this
    clearInterval(this.#timer)
    this.#timer = undefined
    return this
  }

  protected _render(ctx: RenderCtx): string[] {
    const frames = this.state.frames ?? spinnerFrames.dots
    const frame = frames[Spinner.tick(this.state.speed ?? 80) % frames.length]
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
