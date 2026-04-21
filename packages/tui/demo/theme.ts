// oxlint-disable no-await-in-loop
import { readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { box, createCtx, loadTheme, text } from "../src/index.ts"

/**
 * Preview every bundled theme. Walks `assets/themes/`, reads each
 * `<name>.json`, and renders a labelled column per theme so their
 * palettes can be compared side-by-side. Chunks rows of 5 so the
 * output stays readable even as the theme set grows.
 */

const CHUNK = 5
const PANEL_WIDTH = 25

const here = dirname(fileURLToPath(import.meta.url))
const themeDir = resolve(here, "../assets/themes")
const files = readdirSync(themeDir)
  .filter((f) => f.endsWith(".json"))
  .toSorted()

// Always include the pure-ansi theme as a final column — useful for
// seeing how a terminal without truecolor resolves every slot.
const names = [...files.map((f) => f.replace(/\.json$/, "")), "ansi"]

for (let i = 0; i < names.length; i += CHUNK) {
  const row = box({ flexDirection: "row", gap: 1 })
  for (const name of names.slice(i, i + CHUNK)) {
    const theme = loadTheme(name)
    const panel = box(
      { bg: theme.bg, border: true, borderTitle: name, borderTitleStyle: theme.borderTitle },
      text(({ style }) =>
        Object.keys(theme)
          .filter((k) => k !== "bg" && k !== "shiki")
          .map((k) => style.add(k)(k))
          .join("\n"),
      ),
    )
    const panelRows = await panel.render(createCtx({ theme, width: PANEL_WIDTH }))
    row.add(text(panelRows.join("\n")))
  }
  const rows = await row.render(createCtx({ width: (PANEL_WIDTH + 1) * CHUNK }))
  console.log(rows.join("\n"))
  console.log()
}
