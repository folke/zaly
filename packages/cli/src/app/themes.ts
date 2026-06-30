import type { Theme } from "@zaly/tui"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { Select } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { createRef, untrack } from "@zaly/tui"

type ThemeItem = PickerItem & { theme: Theme; id: string }

export async function pickTheme(app: App) {
  const { themeRegistry, loadTheme } = await import("@zaly/tui/themes")
  const custom = await app.ctx.config.resources.themes()

  // All themes (including duplicates), sorted by highest to lowest precedence.
  const all = await Promise.all([...custom, ...themeRegistry.keys()].map(loadTheme))

  // Filter out duplicates, keeping the first (highest precedence) theme with a given ID.
  const seen = new Set<string>()
  const themes = all.filter((t) => {
    if (seen.has(t.id)) return false
    seen.add(t.id)
    return true
  })

  const items: ThemeItem[] = themes
    .map((t) => ({
      id: t.id,
      // name: t.name ?? t.id,
      text: t.name ?? t.id,
      theme: t,
    }))
    .toSorted((a, b) => a.text.localeCompare(b.text))

  const current = untrack(() => app.renderer.theme)
  const ret = await app.pick({
    active: items.findIndex((i) => i.id === current.id),
    items,
    ref: createRef<Select<ThemeItem>>(undefined, {
      onSet: (select) => {
        select.on("changed", async ({ item }) => {
          if (!item) return
          app.renderer.theme = item.theme
        })
      },
    }),
    reverse: true,
    sort: true,
  })
  app.renderer.theme = ret?.theme ?? current
  if (!ret) return
  await app.ctx.config.update({ ui: { theme: ret.id } })
  return ret.id
}
