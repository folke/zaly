import type { ReadTool } from "@zaly/agent"
import type { ToolResultProps } from "./index.ts"

import { justText } from "@zaly/ai"
import { prettyPath } from "@zaly/shared"
import { box, code, memo, widget } from "@zaly/tui"

const PREVIEW_LINE_LIMIT = 10

/** Result renderer for the `read` tool. Once the file contents land,
 *  render them as a syntax-highlighted code block titled with the path.
 *
 *  The kernel's read tool prefixes lines with `cat -n`-style numbering;
 *  we strip it before highlighting so shiki tokens line up with the
 *  source. The numbering is regenerated visually by the terminal's
 *  natural row count anyway. */
export const readResult = widget((props: ToolResultProps<ReadTool>) => {
  const path = memo(() => {
    const p = props.result()?.meta?.file?.path
    return p ? prettyPath(p) : (props.params?.path ?? "unknown path")
  })
  const title = memo(() => (props.result()?.isError === true ? `${path()}  (error)` : path()))
  const content = memo(() => stripLineNumbers(justText(props.result()?.content ?? "")))
  const numberOffset = memo(() => props.result()?.meta?.file?.offset ?? props.params?.offset)

  return box(
    {},
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
})

/** Drop the leading `   N→` / `   N  ` line-number prefix the read tool
 *  emits. Tolerant of slight format variations. */
function stripLineNumbers(content: string): string {
  return content.replaceAll(/^\s*\d+\t/gm, "")
}
