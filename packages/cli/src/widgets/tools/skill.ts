import type { SkillTool } from "@zaly/agent"
import type { ToolRenderer } from "./registry.ts"

import { memo, unwrap } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { log } from "@zaly/tui/widgets/log"
import { markdown } from "@zaly/tui/widgets/markdown"
import { show } from "@zaly/tui/widgets/show"
import { toolPreview } from "../params.ts"

/** Result renderer for the `read` tool. Once the file contents land,
 *  render them as a syntax-highlighted code block titled with the path.
 *
 *  The kernel's read tool prefixes lines with `cat -n`-style numbering;
 *  we strip it before highlighting so shiki tokens line up with the
 *  source. The numbering is regenerated visually by the terminal's
 *  natural row count anyway. */
export const skillRenderer: ToolRenderer<SkillTool> = {
  call(props) {
    return toolPreview(props.call.name, props.params?.name ?? props.params)
  },
  result(props) {
    const unchanged = memo(() => unwrap(props.result)?.meta?.unchanged === true)
    const desc = memo(() => unwrap(props.result)?.meta?.desc ?? "")
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
        () => markdown(desc, { style: "muted" })
      )
    )
  },
}
