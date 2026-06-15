import type { ReadTool } from "@zaly/agent"
import type { ToolRenderer, ToolResultCtx } from "./registry.ts"

import { justText } from "@zaly/ai"
import { prettyPath } from "@zaly/shared"
import { memo } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { code } from "@zaly/tui/widgets/code"
import { log } from "@zaly/tui/widgets/log"
import { show } from "@zaly/tui/widgets/show"

const PREVIEW_LINE_LIMIT = 10

/** Result renderer for the `read` tool. Once the file contents land,
 *  render them as a syntax-highlighted code block titled with the path.
 *
 *  The kernel's read tool prefixes lines with `cat -n`-style numbering;
 *  we strip it before highlighting so shiki tokens line up with the
 *  source. The numbering is regenerated visually by the terminal's
 *  natural row count anyway. */
export const readRenderer: ToolRenderer<ReadTool> = {
  result(props: ToolResultCtx<ReadTool>) {
    const path = memo(() => {
      const p = props.result()?.meta?.path
      return p ? prettyPath(p) : (props.params?.path ?? "unknown path")
    })

    const unchanged = memo(() => props.result()?.meta?.unchanged === true)
    const title = memo(() => (props.result()?.isError === true ? `${path()}  (error)` : path()))
    const content = memo(() => stripLineNumbers(justText(props.result()?.content ?? "")))
    const numberOffset = memo(() => props.result()?.meta?.offset ?? props.params?.offset)

    return box(
      {},
      show(
        {
          use: () =>
            log({
              content: "file unchanged since last read",
              level: "warn",
              visible: unchanged,
            }),
          when: unchanged,
        },
        () =>
          code({
            code: content,
            limit: PREVIEW_LINE_LIMIT,
            more: (_more, msg) => `${msg} read`,
            numberOffset,
            numbered: true,
            path,
            title,
          })
      )
    )
  },
}

/** Drop the leading `   N→` / `   N  ` line-number prefix the read tool
 *  emits. Tolerant of slight format variations. */
function stripLineNumbers(content: string): string {
  return content.replaceAll(/^\s*\d+\t/gm, "")
}
