import type { Renderer } from "@zaly/tui"

import { overlay, text } from "@zaly/tui"

/**
 * Built-in overlays. Help is auto-derived from the actions registry so
 * it stays in sync as new commands are added.
 */
export function buildOverlays(renderer: Renderer): {
  help: ReturnType<typeof overlay>
  toggleHelp: () => void
} {
  const help = overlay(
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
        for (const [id, info] of renderer.actions.list()) {
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
    help,
    toggleHelp() {
      if (help.mounted) help.close()
      else renderer.overlay.open(help)
    },
  }
}
