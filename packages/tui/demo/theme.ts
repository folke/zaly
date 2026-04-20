// oxlint-disable no-await-in-loop
import { box, createCtx, loadTheme, text } from "../src/index.ts"

const root = box({ flexDirection: "row", gap: 1 })

for (const themeName of ["tokyonight-moon", "tokyonight-storm", "tokyonight-day", "ansi"]) {
  const theme = loadTheme(themeName)
  const b = box(
    { bg: theme.bg, border: true, borderTitle: themeName, borderTitleStyle: theme.borderTitle },
    text(({ style }) =>
      Object.keys(theme)
        .filter((k) => k !== "bg")
        .map((k) => style.add(k)(k))
        .join("\n")
    )
  )
  const themeRows = await b.render(createCtx({ theme, width: 25 }))
  root.add(text(themeRows.join("\n")))
}
const rows = await root.render(createCtx({ width: 120 }))
console.log(rows.join("\n"))
