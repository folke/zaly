import type { RenderCtx, State } from "../core/ctx.ts"
import type { Reactive } from "../core/reactive.ts"
import type { Size } from "../layout/size.ts"
import type { Color } from "../style/color.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { resolveSize } from "../layout/size.ts"
import { stringWidth } from "../style/ansi.ts"

export interface ProgressState {
  /** Current value. Clamped to `[0, total]`. Accepts a signal accessor
   *  so callers can drive the bar from reactive state without manual
   *  `setState` plumbing. */
  value: Reactive<number>
  /** Maximum value. Defaults to `1` — pass a fraction in `[0, 1]` to value. */
  total?: Reactive<number>
  /**
   * Bar width in cells. Defaults to `fill` (uses the full `ctx.width`).
   * Shrinks to fit if a `label` is provided.
   */
  width?: Size
  /**
   * Optional label shown to the right of the bar. Pass a string, or a
   * function to style it inline. `null`/`undefined` hides it; `"auto"`
   * formats as a percentage.
   */
  label?: string | ((ctx: RenderCtx, fraction: number) => string)
  /** Foreground theme slot for the filled portion. Defaults to `primary`. */
  color?: Color
  /** Foreground theme slot for the empty portion. Defaults to `muted`. */
  trackColor?: Color
  /** Filled glyph. Defaults to `█`. */
  complete?: string
  /** Empty glyph. Defaults to `░`. */
  incomplete?: string
}

export class Progress extends Node<ProgressState> {
  protected _render(ctx: RenderCtx): string[] {
    const total = unwrap(this.state.total ?? 1)
    const raw = total > 0 ? unwrap(this.state.value) / total : 0
    const fraction = Math.max(0, Math.min(1, raw))

    const complete = this.state.complete ?? "█"
    const incomplete = this.state.incomplete ?? "░"
    const colorFilled = this.state.color ?? "primary"
    const colorTrack = this.state.trackColor ?? "muted"

    // Decide the label (may be empty).
    const labelStr = resolveLabel(this.state.label, ctx, fraction)

    // Resolve target width, reserving space for the label (" <label>").
    const target = resolveSize(this.state.width ?? "fill", ctx.width) ?? ctx.width
    const labelW = labelStr === "" ? 0 : stringWidth(labelStr) + 1
    const barWidth = Math.max(1, target - labelW)

    const filled = Math.round(fraction * barWidth)
    const empty = barWidth - filled

    const bar =
      ctx.style.fg(colorFilled)(complete.repeat(filled)) +
      ctx.style.fg(colorTrack)(incomplete.repeat(empty))

    return [labelStr === "" ? bar : `${bar} ${labelStr}`]
  }
}

/**
 * Factory for `Progress`. Value is required; everything else has a
 * sensible default — `progress({ value: 0.4 })` fills 40% of the
 * available width with `█`, backed by `░` in the theme's `muted` slot.
 *
 * ```ts
 * progress({ value: done, total, label: "auto" })
 * progress({ value: p, color: "ok", width: 20 })
 * progress({ value: 0.7, label: (ctx, f) => ctx.style.dim(`${f*100|0}%`) })
 * ```
 */
export function progress(state: State<ProgressState>): Progress {
  return new Progress(state)
}

function resolveLabel(label: ProgressState["label"], ctx: RenderCtx, fraction: number): string {
  if (label === undefined) return ""
  if (typeof label === "function") return label(ctx, fraction)
  if (label === "auto") return `${Math.round(fraction * 100)}%`
  return label
}
