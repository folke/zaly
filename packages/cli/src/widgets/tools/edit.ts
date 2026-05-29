import type { EditTool } from "@zaly/agent"
import type { ToolRenderer, ToolResultCtx } from "./registry.ts"

import { prettyPath } from "@zaly/shared"
import { memo } from "@zaly/tui"
import { diff } from "@zaly/tui/widgets/diff"

/** Result renderer for the `edit` tool. Renders a unified diff between
 *  `meta.original` and `meta.content` (pre/post-edit content stashed by
 *  the tool). The diff widget runs `diffLines` internally to derive
 *  hunks with proper context. */
export const editRenderer: ToolRenderer<EditTool> = {
  result(props: ToolResultCtx<EditTool>) {
    const path = memo(() => {
      const p = props.result()?.meta?.path ?? props.params?.path
      return p ? prettyPath(p) : "unknown path"
    })
    const original = memo(() => props.result()?.meta?.original ?? "")
    const modified = memo(() => props.result()?.meta?.content ?? "")

    return diff({
      modified,
      original,
      path,
    })
  },
}
