import type { SkillTool } from "@zaly/agent"
import type { ToolRenderer } from "./registry.ts"

import { memo } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { log } from "@zaly/tui/widgets/log"
import { markdown } from "@zaly/tui/widgets/markdown"
import { show } from "@zaly/tui/widgets/show"
import { dirname, resolve } from "pathe"
import { toolPreview } from "../params.ts"

/** Render the loaded skill's description or an unchanged-result notice. */
export const skillRenderer: ToolRenderer<SkillTool> = {
  call(props) {
    return toolPreview(
      props.name,
      memo(() => props.params.name ?? props.params)
    )
  },
  result(props) {
    const unchanged = memo(() => props.result?.meta?.unchanged === true)
    const desc = memo(() => props.result?.meta?.desc ?? "")
    const cwd = memo(() => {
      const path = props.result?.meta?.path
      return path ? dirname(resolve(props.cwd, path)) : props.cwd
    })
    return box(
      {},
      show(
        { when: memo(() => props.result) },
        {
          use: () =>
            log({
              content: "file unchanged since last read",
              level: "warn",
              visible: unchanged,
            }),
          when: unchanged,
        },
        () => markdown(desc, { cwd, style: "muted" })
      )
    )
  },
}
