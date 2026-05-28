import { createCtx } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { text } from "@zaly/tui/widgets/text"
import { loadTheme, themeRegistry } from "@zaly/tui/themes"

/**
 * Preview every bundled theme side-by-side. Uses the `@zaly/tui/themes`
 * async loader map so each palette is resolved on-demand (code-split per
 * theme when bundled). Renders labelled columns in chunks of 5 so the
 * output stays readable even as the theme set grows.
 *
 * For static, tree-shaken imports of a known theme, reach for the
 * per-theme subpath instead:
 *
 * ```ts
 * import dracula from "@zaly/tui/themes/dracula"
 * ```
 */

const CHUNK = 5
const PANEL_WIDTH = 25

// Pull every bundled theme from the async loader map, plus the pure-ansi
// fallback (not a JSON — loaded via `loadTheme("ansi")`) as a final column
// so the render shows how palette-only terminals resolve every slot.
const names: string[] = [...themeRegistry.keys(), "ansi"].toSorted()

for (let i = 0; i < names.length; i += CHUNK) {
  const row = box({ flexDirection: "row", gap: 1 })
  for (const name of names.slice(i, i + CHUNK)) {
    const theme = await loadTheme(name)
    const panel = box(
      { border: true, borderTitle: name, borderTitleStyle: theme.borderTitle, style: "ui" },
      text(({ style }) =>
        Object.keys(theme)
          .filter((k) => k !== "bg" && k !== "shiki")
          .map((k) => style.add(k)(k))
          .join("\n")
      )
    )
    const panelRows = await panel.render(await createCtx({ theme, width: PANEL_WIDTH }))
    row.add(text(panelRows.join("\n")))
  }
  const rows = await row.render(await createCtx({ width: (PANEL_WIDTH + 1) * CHUNK }))
  console.log(rows.join("\n"))
  console.log()
}
