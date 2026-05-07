import type { EditTool } from "@zaly/agent"
import type { DiffEdit } from "@zaly/tui"
import type { ToolResultProps } from "./index.ts"

import { prettyPath } from "@zaly/shared"
import { diff, memo, widget } from "@zaly/tui"

/** Result renderer for the `edit` tool. Each (oldText, newText) pair
 *  becomes a hunk in a single diff: we don't have the pre-edit file
 *  content at render time, so we synthesize an "original" by
 *  concatenating the oldTexts and emit one `DiffEdit` per pair against
 *  its line range. `context: 0` keeps the output focused on the
 *  changes themselves. */
export const editResult = widget((props: ToolResultProps<EditTool>) => {
  const path = memo(() => {
    const p = props.result()?.meta?.path ?? props.params?.path
    return p ? prettyPath(p) : "unknown path"
  })
  const title = memo(() => (props.result()?.isError === true ? `${path()}  (error)` : path()))

  const edits = props.params?.edits ?? []
  const lines: string[] = []
  const diffEdits: DiffEdit[] = []
  for (const e of edits) {
    const oldLines = e.oldText.split("\n")
    const newLines = e.newText.split("\n")
    diffEdits.push({
      from: lines.length,
      replacement: newLines,
      to: lines.length + oldLines.length,
    })
    lines.push(...oldLines)
  }

  return diff({
    context: 0,
    edits: diffEdits,
    original: lines.join("\n"),
    path,
    title,
  })
})
