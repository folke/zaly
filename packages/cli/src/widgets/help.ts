import type { Renderer } from "@zaly/tui"

import { overlay, signal, text } from "@zaly/tui"

/**
 * Help overlay. Reads `renderer.actions` reactively — the list re-
 * renders whenever an action is registered or unregistered (covers
 * Phase B agent-action registration, future `/reload-plugins`, etc.)
 */
export function helpOverlay(renderer: Renderer): {
  overlay: ReturnType<typeof overlay>
  toggle: () => void
} {
  const [actions, setActions] = signal(renderer.actions.list())
  renderer.actions.onChange(() => {
    setActions(renderer.actions.list())
  })

  const o = overlay(
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
        for (const [id, info] of actions()) {
          if (info.hidden || !id.startsWith("app.")) continue
          const name = (info.name ?? id).padEnd(8)
          const desc = (info.desc ?? "").padEnd(28)
          const keys = (info.keys ?? []).join(", ")
          rows.push(`${style.accent(`/ ${name}`)} ${style.dim(desc)} ${style.primary(keys)}`)
        }
        return rows.join("\n")
      },
      { wrap: "none" }
    )
  )

  return {
    overlay: o,
    toggle() {
      if (o.mounted) o.close()
      else renderer.overlay.open(o)
    },
  }
}
