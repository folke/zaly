import type { ToolResultProps } from "./index.ts"

import { box, code, widget } from "@zaly/tui"

interface WriteParams {
  path: string
  content: string
}

/** Result renderer for the `write` tool. The interesting payload is
 *  in `params.content` (the new file body), not the result message —
 *  show the new content as a syntax-highlighted block titled with the
 *  path. The result.isError flag would be reflected by the tool-call
 *  chrome above; nothing extra to do here. */
export const writeResult = widget((props: ToolResultProps) => {
  const params = props.call.params as WriteParams
  return box(
    { padding: [0, 0, 0, 2] },
    code({ code: params.content, path: params.path })
  )
})
