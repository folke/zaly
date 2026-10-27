import type { SkillTool } from "@zaly/agent"
import type { ToolRenderer } from "./registry.ts"

import { memo, unwrap } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { log } from "@zaly/tui/widgets/log"
import { markdown } from "@zaly/tui/widgets/markdown"
import { show } from "@zaly/tui/widgets/show"
import { dirname, resolve } from "pathe"
import { toolPreview } from "../params.ts"

/** Render the loaded skill's description or an unchanged-result notice. */
export const skillRenderer: ToolRenderer<SkillTool> = {
  call(props) {
    return toolPreview(props.call.name, props.params?.name ?? props.params)
  },
  result(props) {
    const unchanged = memo(() => unwrap(props.result)?.meta?.unchanged === true)
    const desc = memo(() => unwrap(props.result)?.meta?.desc ?? "")
    const cwd = memo(() => {
      const path = unwrap(props.result)?.meta?.path
      return path
        ? dirname(resolve(props.cwd ?? process.cwd(), path))
        : (props.cwd ?? process.cwd())
    })
    return box(
      {},
      show(
        { when: memo(() => unwrap(props.result)) },
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
