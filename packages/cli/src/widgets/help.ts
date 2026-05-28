import type { Actions } from "@zaly/tui"

import { signal } from "@zaly/tui"
import { overlay } from "@zaly/tui/widgets/overlay"
import { text } from "@zaly/tui/widgets/text"

/**
 * Help overlay. Reads `renderer.actions` reactively — the list re-
 * renders whenever an action is registered or unregistered (covers
 * Phase B agent-action registration, future `/reload-plugins`, etc.)
 */

export const helpOverlay = (props: { actions: Actions }) => {
  const [actions, setActions] = signal(props.actions.list())
  props.actions.on("change", () => {
    setActions(props.actions.list())
  })
  return overlay(
    {
      border: "rounded",
      borderTitle: "help",
      borderTitleAlign: "center",
      padding: [0, 1],
      width: 52,
      x: 4,
      y: 3,
      zIndex: 20,
    },
    text(
      ({ style }) => {
        const rows: string[] = []
        for (const info of actions()) {
          if (info.hidden || !info.id.startsWith("app.")) continue
          const name = (info.cmd ?? info.id).padEnd(8)
          const desc = (info.desc ?? "").padEnd(28)
          const keys = (info.keys ?? []).join(", ")
          rows.push(`${style.accent(`/ ${name}`)} ${style.dim(desc)} ${style.primary(keys)}`)
        }
        return rows.join("\n")
      },
      { wrap: "none" }
    )
  )
}
