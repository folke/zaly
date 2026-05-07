import type { WriteTool } from "@zaly/agent"
import type { ToolResultProps } from "./index.ts"

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
export const writeResult = widget((props: ToolResultProps<WriteTool>) => {
  const path = memo(() => {
    const p = props.result()?.meta?.path
    return p ? prettyPath(p) : (props.params?.path ?? "unknown path")
  })
  const title = memo(() => (props.result()?.isError === true ? `${path()}  (error)` : path()))
  const text = memo(() => props.params?.content ?? "")

  return box(
    {},
    code({
      code: text,
      limit: PREVIEW_LINE_LIMIT,
      numbered: true,
      path,
      title,
    })
  )
})
