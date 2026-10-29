import type { ReadTool } from "@zaly/agent"
import type { ToolRenderer } from "./registry.ts"

import { justText } from "@zaly/ai"
import { prettyPath } from "@zaly/shared"
import { memo } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { code } from "@zaly/tui/widgets/code"
import { log } from "@zaly/tui/widgets/log"
import { show } from "@zaly/tui/widgets/show"
import { text } from "@zaly/tui/widgets/text"
import { fileCall } from "./default.ts"

const PREVIEW_LINE_LIMIT = 5

/** Show requested/resolved line ranges in the call preview and render
 *  text results as numbered, syntax-highlighted code blocks. */
export const readRenderer: ToolRenderer<ReadTool> = {
  call(props) {
    const path = fileCall(props)
    // Let flex shrink the path; toolPreview truncates it to the allocated width.
    path.state.wrap = "char"

    const range = memo(() => {
      const result = props.result
      const meta = result?.meta
      if (result === undefined) {
        const params = props.params
        const offset = params.offset ?? 1
        const limit = params.limit
        if (offset < 0) {
          return limit !== undefined && limit < -offset
            ? `${-offset} from end · ${limit} line${limit === 1 ? "" : "s"}`
            : `last ${-offset} line${offset === -1 ? "" : "s"}`
        } else if (limit !== undefined) {
          const start = Math.max(1, offset)
          return `${start}–${start + limit - 1}`
        } else if (offset > 1) return `${offset}–…`
      } else if (!result.isError && meta?.kind === "read" && !meta.full && !meta.unchanged) {
        return meta.limit > 0 ? `${meta.offset}–${meta.offset + meta.limit - 1}` : "no lines"
      }
      return ""
    })
    return box(
      { flexDirection: "row", gap: 1 },
      path,
      text(range, { flexShrink: 0, style: "quiet" })
    )
  },

  result(props) {
    const path = memo(() => {
      const p = props.result?.meta?.path
      return p ? prettyPath(p) : (props.params.path ?? "unknown path")
    })

    const unchanged = memo(() => props.result?.meta?.unchanged === true)
    const title = memo(() => (props.result?.isError === true ? `${path()}  (error)` : path()))
    const content = memo(() => justText(props.result?.content ?? ""))
    const numberOffset = memo(() => props.result?.meta?.offset ?? props.params.offset)

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
