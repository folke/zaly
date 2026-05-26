import type { Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Accessor } from "@zaly/tui"
import type { BubbleType } from "./bubble.ts"

import { safeParseToolParams } from "@zaly/ai"
import { truncateAnsi } from "@zaly/shared/ansi"
import { box, inspect, memo, show, text, unwrap, widget } from "@zaly/tui"
import { bubble } from "./bubble.ts"
import { toolResult } from "./tools/registry.ts"

export type ToolCallProps = {
  call: ToolCallPart
  result: Accessor<ToolResult | undefined>
  summary?: Accessor<boolean>
}

/**
 * Tool-call block: name + intent on top, params preview, then a status
 * line that flips from running to ✓/✗ once the result arrives. The
 * result body itself is delegated to `toolResult`, which dispatches via
 * `toolResultRegistry` to the renderer registered for `call.name`
 * (or a generic dim-text fallback).
 *
 * `result` is reactive — pass a signal whose value is `undefined` while
 * the call is in flight and the resolved `ToolResult` once it completes.
 * The status icon and the result body update automatically.
 */
export const toolCall = widget((props: ToolCallProps) => {
  const { call } = props
  const { description: desc, ...params } =
    safeParseToolParams<Tool<{ description: string } & Record<string, unknown>>>(call.params) ?? {}

  const status = memo((): BubbleType => {
    const r = unwrap(props.result)
    if (r === undefined) return "tool_pending"
    return r.isError ? "tool_error" : "tool_success"
  })

  const isError = memo(() => props.result()?.isError ?? false)

  const full = memo(() => !(unwrap(props.summary) ?? false))

  return bubble(
    { type: status },
    box(
      { flexDirection: "column" },
      // Tool name + params preview
      text(({ style, width }) => {
        const p = params.path ?? params.command ?? params.url ?? params.pattern ?? params
        const json =
          typeof p === "string"
            ? style.success(JSON.stringify(p))
            : inspect([p], {
                inspect: { breakLength: Infinity, compact: true },
              })
        return `${style.primary.bold(call.name)}(${truncateAnsi(json, Math.min(80, width))})`
      }),
      // Optional description, dimmed
      text(({ style }) => style.dim(desc ?? ""), { visible: desc !== undefined }),
      show(
        { when: full },
        // Result body, once it arrives
        toolResult({ call: props.call, params, result: props.result }),
        text(
          ({ style }) =>
            style.error(
              `${props.result()?.error?.code}: ${props.result()?.error?.message ?? "Unknown error"}`
            ),
          { visible: isError }
        )
      )
    )
  )
})

export const toolCalls = widget((props: { calls: ToolCallProps[]; done: Accessor<boolean> }) => {
  const pending = memo(() => !props.done() && props.calls.some((c) => c.result() === undefined))
  return box({}, ...props.calls.map((call) => toolCall({ ...call, summary: pending })))
})
