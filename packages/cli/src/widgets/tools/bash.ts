import type { BashTool } from "@zaly/agent"
import type { ToolResultProps } from "./registry.ts"

import { justText } from "@zaly/ai"
import { box, code, memo, text, widget, formatLines } from "@zaly/tui"

const PREVIEW_LINE_LIMIT = 10

/** Result renderer for the `bash` tool.
 *
 *  Two stacked code blocks share the `code` theme backdrop so they
 *  read as one continuous session:
 *
 *    1. The command — `bash`-tokenized, so multi-line commands
 *       (`\` continuations, `&&` chains, heredocs, function bodies)
 *       highlight correctly. The line-anchored `shellsession` grammar
 *       can't continue tokenization across lines, which is why we
 *       split the rendering rather than wrap the whole thing in it.
 *
 *    2. The output — no lang, so it gets the same backdrop without
 *       being mis-tokenized when the captured text happens to contain
 *       shell-shaped fragments. */
export const bashResult = widget((props: ToolResultProps<BashTool>) => {
  const { command } = props.params ?? {}
  return box(
    { flexDirection: "column", padding: [0, 1], style: "code", width: "fit" },
    box(
      { flexDirection: "row", width: "fit" },
      text("❯ ", { style: "primary" }),
      code({ code: command ?? "", lang: "bash", style: false })
    ),
    text({
      content: (ctx) =>
        memo(() => {
          const content = props.result()?.content
          if (!content) return "…"
          return formatLines(justText(content), {
            limit: PREVIEW_LINE_LIMIT,
            maxLineLength: ctx.width,
            style: ctx.style.muted,
          }).join("\n")
        }),
      style: "muted",
    })
  )
})
