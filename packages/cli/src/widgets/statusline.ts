import type { ThemeKey } from "@zaly/tui"
import type { AppState } from "../types.ts"

import { formatNumber as fmt } from "@zaly/shared"
import { memo } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { spinner } from "@zaly/tui/widgets/spinner"
import { text } from "@zaly/tui/widgets/text"
import { widget } from "@zaly/tui/widgets/widget"

/**
 * Single-line status: spinner · zaly · model · status · ctx · usage.
 * Each `Reactive<T>` is unwrapped inside the text closure so signals
 * auto-subscribe at render time — change a signal, only this line
 * re-renders. Usage section is suppressed before the first step.
 */
export const statusline = widget((props: AppState) =>
  box(
    { flexDirection: "row", gap: 1 },
    spinner({ color: "accent", idle: "✓", running: memo(() => props.loading) }),
    text(
      ({ style: s }) => {
        if (props.step < 0) return "" // subscribe to step for usage refresh

        const components: (string | undefined | (() => string | undefined))[] = []

        const dot = s.dim("·")

        components.push(s.primary.bold("zaly"))

        if (props.status !== "ready") components.push(s.accent(props.status))

        if (props.scroll.offset < props.scroll.total) {
          const pct = Math.round((props.scroll.offset / props.scroll.total) * 100)
          const pcts = pct > 0 ? ` (${pct}%)` : ""
          const below = props.scroll.below
          components.push(s.warn.bold(`↓ ${below} lines${pcts}`))
        }

        components.push(() => {
          const m = props.model
          const reasoning =
            props.reasoning && m?.spec.reasoning ? s.primary(` ∴ ${props.reasoning}`) : ""
          if (!m) return props.status === "loading" ? undefined : s.error("no model")
          return `${s.success(m.id)}${reasoning}`
        })

        const u = props.usage

        if (u && u.contextSize > 0) {
          const limit = props.model?.spec.contextSize ?? 0
          components.push(() => {
            let pctStyle: ThemeKey = "success"
            const pct = limit > 0 ? Math.round((u.contextSize / limit) * 100) : 0
            if (pct >= 80) pctStyle = "error"
            else if (pct >= 60) pctStyle = "warn"
            const pcts = limit > 0 ? s.add(pctStyle)(` (${pct}%)`) : ""
            return `${s.dim("ctx")} ${fmt(u.contextSize)}${pcts}`
          })

          components.push(() => {
            const read = u.cacheRead > 0 ? ` ${s.dim("⚡")}${fmt(u.cacheRead)}` : ""
            const write = u.cacheWrite > 0 ? ` ${s.dim("+")}${fmt(u.cacheWrite)}` : ""
            return `${s.dim("↑")}${fmt(u.input)} ${s.dim("↓")}${fmt(u.output)}${read}${write}`
          })
        }

        return components
          .map((c) => (typeof c === "function" ? c() : c))
          .filter((c): c is string => !!c)
          .join(` ${dot} `)
      },
      { flexGrow: 1, wrap: "none" }
    )
  )
)
