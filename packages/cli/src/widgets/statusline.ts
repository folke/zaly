import type { AppState } from "../types.ts"

import { box, memo, spinner, text, widget } from "@zaly/tui"

/**
 * Single-line status: spinner · zaly · model · status · ctx · usage.
 * Each `Reactive<T>` is unwrapped inside the text closure so signals
 * auto-subscribe at render time — change a signal, only this line
 * re-renders. Usage section is suppressed before the first step.
 */
export const statusline = widget((props: AppState) =>
  box(
    { flexDirection: "row", gap: 1 },
    spinner({ color: "accent", idle: "✓", running: memo(() => props.busy) }),
    text(({ style }) => {
      const dot = style.dim("·")
      const lhs = `${style.primary.bold("zaly")} ${dot} ${style.success(props.model?.id ?? "no model")} ${dot} ${style.accent(props.status)}`
      const u = props.usage
      const cacheRead = u.cacheRead ?? 0
      const cacheWrite = u.cacheWrite ?? 0
      // Each field is its own billing tier and they sum to the full
      // context-window usage: uncached input + cached reads + cached
      // writes + output. Read and write are shown only when present
      // (non-Anthropic providers omit them or report only reads).
      const total = u.input + cacheRead + cacheWrite + u.output
      if (total === 0) return lhs
      const read = cacheRead > 0 ? ` ${style.dim("⚡")}${fmt(cacheRead)}` : ""
      const write = cacheWrite > 0 ? ` ${style.dim("+")}${fmt(cacheWrite)}` : ""
      return `${lhs} ${dot} ${style.dim("ctx")} ${fmt(total)} ${dot} ${style.dim("↑")}${fmt(u.input)} ${style.dim("↓")}${fmt(u.output)}${read}${write}`
    })
  )
)

/** Compact token formatter — `812`, `4.2k`, `123k`, `1.4M`. */
function fmt(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}
