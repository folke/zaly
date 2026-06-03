import type { PermissionRequest, Suggestion } from "@zaly/agent"
import type { Option } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { box } from "@zaly/tui/widgets/box"
import { code } from "@zaly/tui/widgets/code"
import { text } from "@zaly/tui/widgets/text"
import { bubble } from "../widgets/bubble.ts"
import { toolPreview } from "../widgets/tool.ts"

export async function allow(req: PermissionRequest, app: App): Promise<boolean> {
  const items: Option<boolean | Suggestion>[] = []
  items.push({ name: "Allow", value: true })
  items.push({ name: "Deny", value: false })
  for (const s of req.suggestions ?? []) {
    if (s.kind === "rule") {
      items.push({
        desc: s.description,
        name: `Allow \`${s.scope}(${s.pattern})\``,
        value: { kind: "rule", pattern: s.pattern, scope: s.scope },
      })
    } else {
      items.push({
        desc: s.description,
        name: `Add workspace ${s.path}`,
        value: { kind: "workspace", path: s.path },
      })
    }
  }

  const title = req.ask
  const details = () =>
    bubble(
      { box: { padding: [1, 0] }, type: "permission" },
      req.scope === "bash"
        ? box(
            { flexDirection: "row", style: "code", width: "fit" },
            text("❯ ", { style: "primary" }),
            code({ code: req.input, lang: "bash", style: false })
          )
        : toolPreview(req.scope, req.input)
    )

  const ret = await app.pick<(typeof items)[number]>({ details, items, title })
  if (ret === undefined || ret.value === false) return false
  if (ret.value !== true) {
    const perms = await app.agent.ctx.permissions()
    const s = ret.value
    if (s.kind === "rule") perms.addRule({ ...s, policy: "allow" })
    else perms.addWorkspace(s.path)
  }
  return true
}
