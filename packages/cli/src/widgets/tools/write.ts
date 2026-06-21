import type { WriteTool } from "@zaly/agent"
import type { ToolRenderer, ToolResultCtx } from "./registry.ts"

import { prettyPath } from "@zaly/shared"
import { memo, unwrap } from "@zaly/tui"
import { diff } from "@zaly/tui/widgets/diff"

/** Result renderer for the `write` tool. Renders a unified diff between
 *  the pre-write content (`meta.original`, empty for new files) and
 *  the post-write content (`meta.content`). New files show as fully-
 *  added — same shape as a GitHub "new file" diff view. */
export const writeRenderer: ToolRenderer<WriteTool> = {
  result(props: ToolResultCtx<WriteTool>) {
    const path = memo(() => {
      const p = unwrap(props.result)?.meta?.path
      return p ? prettyPath(p) : (props.params?.path ?? "unknown path")
    })
    const original = memo(() => unwrap(props.result)?.meta?.original ?? "")
    // Post-write content comes straight from the call's `params.content` —
    // the tool doesn't redundantly stash it on meta.
    const modified = memo(() => props.params?.content ?? "")

    return diff({
      modified,
      original,
      path,
    })
  },
}
