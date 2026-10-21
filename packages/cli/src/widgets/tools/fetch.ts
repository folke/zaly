import type { FetchTool } from "@zaly/agent"
import type { ToolRenderer } from "./registry.ts"

import { justText } from "@zaly/ai"
import { prettyPath } from "@zaly/shared"
import { cleanText } from "@zaly/shared/text"
import { memo, unwrap } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { code } from "@zaly/tui/widgets/code"
import { log } from "@zaly/tui/widgets/log"
import { markdown } from "@zaly/tui/widgets/markdown"
import { show } from "@zaly/tui/widgets/show"
import { text } from "@zaly/tui/widgets/text"

const PREVIEW_LINE_LIMIT = 10

export const fetchRenderer: ToolRenderer<FetchTool> = {
  result(props) {
    const result = memo(() => unwrap(props.result))
    const meta = memo(() => result()?.meta)
    const content = memo(() => cleanText(justText(result()?.content ?? "")))

    const link = memo(() => {
      const m = meta()
      const url = m?.url ?? props.params?.url ?? ""
      if (!url) return ""
      const title = m?.title ? cleanText(m.title) : url
      return `[${title}](${url})`
    })

    const warning = memo(() => meta()?.warning)

    const error = memo(() => {
      const m = meta()
      if (m?.ok !== false) return
      const status = `${m.status} ${m.statusText}`.trim()
      const type = m.type === "text" ? (m.format ?? m.contentType) : m.type.toUpperCase()
      return cleanText([status, type].filter(Boolean).join(" · "))
    })

    const saved = memo(() => {
      const truncated = meta()?.truncated
      return truncated
        ? `Full output: ${prettyPath(truncated.fullOutputPath)} (${truncated.totalLines} lines)`
        : ""
    })

    return show({ when: result }, () => {
      const format = meta()?.format
      const lang = format === "plain" ? undefined : format
      return box(
        {},
        show({ when: link }, () => markdown(link)),
        show({ when: error }, () => log({ content: () => error() ?? "", level: "error" })),
        show({ when: warning }, () => log({ content: () => warning() ?? "", level: "warn" })),
        show({ when: content }, () =>
          code({
            code: content,
            lang,
            limit: PREVIEW_LINE_LIMIT,
            more: (_more, msg) => `${msg} fetched`,
            wrap: "word",
          })
        ),
        show({ when: saved }, () => text(saved, { style: "quiet", wrap: "char" }))
      )
    })
  },
}
