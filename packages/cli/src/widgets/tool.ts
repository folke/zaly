import type { ToolCallPart, ToolResult } from "@zaly/ai"
import type { Reactive } from "@zaly/tui"

import { stringifyContent } from "@zaly/ai"
import { box, inspect, text, unwrap, widget } from "@zaly/tui"

/**
 * Tool-call block: name + intent on top, params preview, then a status
 * line that flips from running to ✓/✗ once the result arrives.
 *
 * `result` is reactive — pass a signal whose value is `undefined` while
 * the call is in flight and the resolved `ToolResult` once it completes.
 * The status icon and result preview update automatically.
 *
 * Per-tool result rendering (code blocks for read, diff for edit, etc.)
 * is the next step — when added, it'll consume the same `result`
 * accessor as a child widget switched on `call.name`.
 */
export const toolCall = widget(
  (props: { call: ToolCallPart; result: Reactive<ToolResult | undefined> }) => {
    const { call } = props
    const params = call.params as Record<string, unknown>
    const description = typeof params.description === "string" ? params.description : undefined
    const rest: Record<string, unknown> = { ...params }
    if (description !== undefined) delete rest.description
    const json = inspect([rest])
    let preview = ""
    if (json !== "{}") preview = json.length > 200 ? `${json.slice(0, 197)}...` : json

    return box(
      { flexDirection: "column", padding: [0, 1, 1, 1] },
      text(({ style }) => {
        const r = unwrap(props.result)
        if (r === undefined) return `${style.dim("…")} ${style.primary(call.name)}`
        const icon = r.isError ? style.error("✗") : style.success("✓")
        return `${icon} ${style.primary(call.name)}`
      }),
      description !== undefined
        ? text(({ style }) => style.dim(`  ${description}`))
        : undefined,
      preview !== "" ? text(`  ${preview}`) : undefined,
      text(({ style }) => {
        const r = unwrap(props.result)
        if (r === undefined) return ""
        const content = stringifyContent(r.content)
        const trimmed = content.length > 500 ? `${content.slice(0, 497)}...` : content
        return style.dim(trimmed.replaceAll(/^/gm, "  "))
      })
    )
  }
)
