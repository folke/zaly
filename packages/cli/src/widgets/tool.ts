import type { Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Accessor } from "@zaly/tui"
import type { BubbleType } from "./bubble.ts"

import { safeParseToolParams } from "@zaly/ai"
import { box, inspect, memo, show, text, truncateAnsi, unwrap, widget } from "@zaly/tui"
import { bubble } from "./bubble.ts"
import { toolResult } from "./tools/index.ts"
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
export const toolCall = widget(
  (props: { call: ToolCallPart; result: Accessor<ToolResult | undefined> }) => {
    const { call } = props
    const { description: desc, ...params } =
      safeParseToolParams<Tool<{ description: string } & Record<string, unknown>>>(call.params) ??
      {}

    const status = memo((): BubbleType => {
      const r = unwrap(props.result)
      if (r === undefined) return "tool_pending"
      return r.isError ? "tool_error" : "tool_success"
    })

    return bubble(
      { type: status },
      box(
        { flexDirection: "column" },
        // Tool name + params preview
        text(({ style, width }) => {
          const p = params.path ?? params.command ?? params.url ?? params
          const json =
            typeof p === "string"
              ? style.success(JSON.stringify(p))
              : inspect([p], {
                  inspect: { breakLength: Infinity, compact: true },
                })
          return `${style.primary.bold(call.name)}(${truncateAnsi(json, Math.min(80, width))})`
        }),
        // Optional description, dimmed
        show(
          { when: desc !== undefined },
          text(({ style }) => style.dim(desc ?? ""))
        ),
        // Result body, once it arrives
        toolResult({ call: props.call, params, result: props.result })
      )
    )
  }
)
