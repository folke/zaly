import type { BashTool, FindTool, GrepTool } from "@zaly/agent"
import type { ParamsOf } from "@zaly/ai"
import type { ToolRenderer } from "./registry.ts"

import { justText } from "@zaly/ai"
import { memo, unwrap } from "@zaly/tui"
import { formatLines } from "@zaly/tui/text"
import { box } from "@zaly/tui/widgets/box"
import { code } from "@zaly/tui/widgets/code"
import { text } from "@zaly/tui/widgets/text"

const PREVIEW_LINE_LIMIT = 10
const ignore = new Set(["limit", "max_columns", "pattern", "paths", "glob"])

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
export const bashRenderer: ToolRenderer<BashTool | FindTool | GrepTool> = {
  result(props) {
    const command = memo(() => {
      if (props.call.name === "bash") {
        const p = props.params as Partial<ParamsOf<BashTool>>
        return p.command ?? ""
      } else if (props.call.name === "find" || props.call.name === "grep") {
        const p = props.params as Partial<ParamsOf<FindTool | GrepTool>>
        const cmd = [props.call.name]
        const all = p as Record<string, string | string[] | undefined>
        const positional = props.call.name === "find" ? all.glob : all.pattern
        if (typeof positional === "string") cmd.push(positional)
        else if (Array.isArray(positional)) cmd.push(...positional)
        if (p.paths) cmd.push(...p.paths)
        // oxlint-disable-next-line prefer-const
        for (let [k, v] of Object.entries(p)) {
          if (ignore.has(k)) continue
          k = k.replace(/_/g, "-") // normalize kebab/underscore for flag generation
          if (v === true) {
            cmd.push(`--${k}`)
          } else if (v === false) {
            cmd.push(`--no-${k}`)
          } else if (Array.isArray(v)) {
            for (const a of v) {
              cmd.push(`--${k}`, a)
            }
          } else {
            cmd.push(`--${k}`, String(v))
          }
        }

        return [cmd[0], ...cmd.slice(1).map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(
          " "
        )
      }
      return ""
    })

    return box(
      { flexDirection: "column", padding: [0, 1], style: "code", width: "fit" },
      box(
        { flexDirection: "row", width: "fit" },
        text("❯ ", { style: "primary" }),
        code({ code: command, lang: "bash", style: false })
      ),
      text({
        content: (ctx) =>
          memo(() => {
            const content = unwrap(props.result)?.content
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
  },
}
