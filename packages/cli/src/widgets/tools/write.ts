import type { WriteTool } from "@zaly/agent"
import type { ToolResultProps } from "./index.ts"

import { prettyPath } from "@zaly/shared"
import { diff, memo, widget } from "@zaly/tui"

/** Result renderer for the `write` tool. Renders a unified diff between
 *  the pre-write content (`meta.original`, empty for new files) and
 *  the post-write content (`meta.content`). New files show as fully-
 *  added — same shape as a GitHub "new file" diff view. */
export const writeResult = widget((props: ToolResultProps<WriteTool>) => {
  const path = memo(() => {
    const p = props.result()?.meta?.path
    return p ? prettyPath(p) : (props.params?.path ?? "unknown path")
  })
  const title = memo(() => (props.result()?.isError === true ? `${path()}  (error)` : path()))
  const original = memo(() => props.result()?.meta?.original ?? "")
  // Post-write content comes straight from the call's `params.content` —
  // the tool doesn't redundantly stash it on meta.
  const modified = memo(() => props.params?.content ?? "")

  return diff({
    modified,
    original,
    path,
    title,
  })
})
