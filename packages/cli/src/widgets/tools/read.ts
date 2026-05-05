import type { ReadTool } from "@zaly/agent"
import type { ToolResultProps } from "./index.ts"

import { stringifyContent } from "@zaly/ai"
import { box, code, memo, unwrap, widget } from "@zaly/tui"

/** Result renderer for the `read` tool. Once the file contents land,
 *  render them as a syntax-highlighted code block titled with the path.
 *
 *  The kernel's read tool prefixes lines with `cat -n`-style numbering;
 *  we strip it before highlighting so shiki tokens line up with the
 *  source. The numbering is regenerated visually by the terminal's
 *  natural row count anyway. */
export const readResult = widget((props: ToolResultProps<ReadTool>) => {
  const path = props.params?.path ?? "unknown path"
  return box(
    {},
    code({
      code: memo(() => {
        const r = unwrap(props.result)
        return r === undefined ? "" : stripLineNumbers(stringifyContent(r.content))
      }),
      path,
      title: memo(() => {
        const r = unwrap(props.result)
        return r?.isError === true ? `${path}  (error)` : path
      }),
    })
  )
})

/** Drop the leading `   N→` / `   N  ` line-number prefix the read tool
 *  emits. Tolerant of slight format variations. */
function stripLineNumbers(content: string): string {
  return content.replaceAll(/^\s*\d+[→\s]/gm, "")
}
