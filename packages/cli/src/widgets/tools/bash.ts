import type { BashTool, FindTool, FindToolMeta, GrepTool, GrepToolMeta } from "@zaly/agent"
import type { ParamsOf } from "@zaly/ai"
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
export const bashResult = widget((props: ToolResultProps<BashTool | FindTool | GrepTool>) => {
  const command = memo(() => {
    if (props.call.name === "bash") {
      const p = props.params as Partial<ParamsOf<BashTool>>
      return p.command ?? ""
    } else if (props.call.name === "find" || props.call.name === "grep") {
      const p = props.params as Partial<ParamsOf<FindTool | GrepTool>>
      const m = props.result()?.meta as FindToolMeta | GrepToolMeta | undefined
      const defaults = {
        case_sensitive: false,
        context: 0,
        cwd: m?.cwd,
        fixed_strings: false,
        follow: false,
        hidden: false,
        ignore: true,
        type: "file",
      }
      const cmd = [props.call.name]
      if (p.pattern) cmd.push(p.pattern)
      if (p.paths) cmd.push(...p.paths)
      // oxlint-disable-next-line prefer-const
      for (let [k, v] of Object.entries(p)) {
        if (k === "limit" || k === "max_columns") continue
        if (v === defaults[k as keyof typeof defaults]) continue
        if (k === "pattern") continue
        if (k === "paths") continue
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

      return [cmd[0], ...cmd.slice(1).map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(" ")
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
