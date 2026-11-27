import type { SessionSearchTool } from "@zaly/agent"
import type { ToolRenderer } from "./registry.ts"

import { justText } from "@zaly/ai"
import { safeParseJson } from "@zaly/shared"
import { cleanTextTui } from "@zaly/shared/text"
import { memo } from "@zaly/tui"
import { formatLines } from "@zaly/tui/text"
import { box } from "@zaly/tui/widgets/box"
import { markdown } from "@zaly/tui/widgets/markdown"
import { show } from "@zaly/tui/widgets/show"
import { text } from "@zaly/tui/widgets/text"
import { toolPreview } from "../params.ts"

const PREVIEW_LINE_LIMIT = 15

function resultMarkdown(jsonl: string): string | undefined {
  const value = jsonl.trim()
  if (!value) return "No matches found."
  const sections: string[] = []
  for (const line of value.split("\n")) {
    const row = safeParseJson(line)
    if (
      !row ||
      typeof row !== "object" ||
      !("id" in row) ||
      !("role" in row) ||
      !("message" in row)
    )
      return
    const { id, role, message } = row
    if (typeof id !== "string" || !/^[\w-]+$/.test(id) || typeof message !== "string") return
    if (role !== "assistant" && role !== "user" && role !== "tool" && role !== "system") return
    const title = role[0].toUpperCase() + role.slice(1)
    sections.push(`**${title}:** ${cleanTextTui(message).trim()}`)
  }
  return sections.join("\n\n---\n\n")
}

export const sessionSearchRenderer: ToolRenderer<SessionSearchTool> = {
  call(props) {
    return toolPreview(
      props.name,
      memo(() => props.params.pattern ?? props.params.id ?? props.params)
    )
  },

  result(view) {
    const result = memo(() => resultMarkdown(justText(view.result?.content ?? "")))

    return box(
      { padding: [0, 1], style: "code", width: "fit" },
      show(
        {
          use: () =>
            markdown(
              memo(() => result() ?? ""),
              { cwd: view.cwd, limit: PREVIEW_LINE_LIMIT }
            ),
          when: result,
        },
        () =>
          text({
            content: (ctx) =>
              memo(() => {
                const content = view.result?.content
                if (!content) return "…"
                return formatLines(justText(content), {
                  limit: PREVIEW_LINE_LIMIT,
                  style: ctx.style.muted,
                }).join("\n")
              }),
            style: "muted",
            wrap: "word",
          })
      )
    )
  },
}
