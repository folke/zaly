import type { EditTool } from "@zaly/agent"
import type { ToolResultProps } from "./index.ts"

import { prettyPath } from "@zaly/shared"
import { diff, memo, widget } from "@zaly/tui"

/** Result renderer for the `edit` tool. Renders a unified diff between
 *  `meta.original` and `meta.content` (pre/post-edit content stashed by
 *  the tool). The diff widget runs `diffLines` internally to derive
 *  hunks with proper context. */
export const editResult = widget((props: ToolResultProps<EditTool>) => {
  const path = memo(() => {
    const p = props.result()?.meta?.path ?? props.params?.path
    return p ? prettyPath(p) : "unknown path"
  })
  const title = memo(() => (props.result()?.isError === true ? `${path()}  (error)` : path()))
  const original = memo(() => props.result()?.meta?.original ?? "")
  const modified = memo(() => props.result()?.meta?.content ?? "")

  return diff({
    modified,
    original,
    path,
    title,
  })
})
