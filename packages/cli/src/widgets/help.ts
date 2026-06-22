import type { Action, Actions } from "@zaly/tui"

import { capitalize } from "@zaly/tui/text"

/**
 * Help overlay. Reads `renderer.actions` reactively — the list re-
 * renders whenever an action is registered or unregistered (covers
 * Phase B agent-action registration, future `/reload-plugins`, etc.)
 */

export function help(actions: Actions) {
  const grouped = new Map<string, Action[]>()
  for (const info of actions.list()) {
    const name = info.id.split(".")[0] ?? "general"
    let group = grouped.get(name)
    if (group === undefined) grouped.set(name, (group = []))
    group.push(info)
  }
  const rows: string[] = ["# Help", ""]
  const groupNames = [...grouped.keys()].toSorted((a, b) => a.localeCompare(b))
  for (const group of groupNames) {
    const cells: string[][] = []
    for (const info of grouped.get(group) ?? []) {
      const desc = info.desc ?? ""
      const keys = (info.keys ?? []).map((k) => `\`${k}\``).join(" / ")
      const cmd = info.cmd ? `\`/${info.cmd}\`` : ""
      cells.push([cmd, keys, desc])
    }
    const used = [0, 1, 2].map((i) => cells.some((c) => c[i].length > 0))
    if (!used.some(Boolean)) continue
    cells.unshift(["---", "---", "---"])
    cells.unshift(["Action", "Keys", "Description"])
    rows.push(`## ${capitalize(group)}`)
    for (const row of cells) {
      rows.push(`| ${row.filter((_, i) => used[i]).join(" | ")} |`)
    }
    rows.push("")
  }
  return rows.join("\n").trimEnd()
}
