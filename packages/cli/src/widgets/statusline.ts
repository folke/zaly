import type { ThemeKey } from "@zaly/tui"
import type { AppState } from "../types.ts"

import { formatNumber as fmt } from "@zaly/shared"
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
      const limit = props.model?.spec.limit.context ?? 0
      if (total === 0) return lhs
      const read = cacheRead > 0 ? ` ${style.dim("⚡")}${fmt(cacheRead)}` : ""
      const write = cacheWrite > 0 ? ` ${style.dim("+")}${fmt(cacheWrite)}` : ""
      const pct = limit > 0 ? Math.round((total / limit) * 100) : 0
      let pctStyle: ThemeKey = "success"
      if (pct >= 80) pctStyle = "error"
      else if (pct >= 60) pctStyle = "warn"
      const pcts = limit > 0 ? style.add(pctStyle)(`(${pct}%)`) : ""
      return `${lhs} ${dot} ${style.dim("ctx")} ${fmt(total)} ${pcts} ${dot} ${style.dim("↑")}${fmt(u.input)} ${style.dim("↓")}${fmt(u.output)}${read}${write}`
    })
  )
)
