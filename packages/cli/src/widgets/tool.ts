import type { Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Accessor, InspectOpts, Reactive } from "@zaly/tui"
import type { BubbleType } from "./bubble.ts"

import { safeParseToolParams } from "@zaly/ai"
import { truncateAnsi } from "@zaly/shared/ansi"
import { inspect, memo, unwrap } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { log } from "@zaly/tui/widgets/log"
import { show } from "@zaly/tui/widgets/show"
import { text } from "@zaly/tui/widgets/text"
import { widget } from "@zaly/tui/widgets/widget"
import { bubble } from "./bubble.ts"
import { toolRenderer } from "./tools/registry.ts"

export type ToolCallProps = {
  call: ToolCallPart
  result: Reactive<ToolResult | undefined>
  pending?: Accessor<boolean>
  collapsed?: Reactive<boolean>
}

const COMMON_PARAMS = ["path", "command", "url", "pattern", "glob"]

/** Render a tool call preview: `toolName(param)` */
export function toolPreview(tool: string, params: string | Record<string, unknown> = "") {
  return text((ctx) => {
    const { style, width } = ctx
    const p = toolParams(params, { width: Math.min(80, width - tool.length - 2) })
    return `${style.primary.bold(tool)}(${p})`
  })
}

/** Convert tool params to a string for preview:
 * - If `params` is a string, try to parse it as JSON first.
 * - If `params` is an object, extract the first common param if available.
 * - Otherwise, inspect the value with optional quoting and truncation.
 */
export function toolParams(
  params: unknown = "",
  opts: InspectOpts & { quote?: boolean; width?: number } = {}
) {
  // Try to parse params as JSON if it's a string
  if (typeof params === "string")
    params = safeParseToolParams<Tool<Record<string, unknown>>>(params) ?? params

  let value = params

  // Check if params is an object and extract the first common param if available
  if (typeof params === "object" && params !== null && !Array.isArray(params)) {
    const rec = params as Record<string, unknown>
    const key = COMMON_PARAMS.find((k) => rec[k] !== undefined)
    value = key ? rec[key] : params
  }

  const ret =
    typeof value === "string" && opts.quote === false
      ? value
      : inspect(value, { indent: 0, ...opts })
  return opts.width ? truncateAnsi(ret, opts.width) : ret
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

  const isError = memo(() => unwrap(props.result)?.isError ?? false)
  const showResult = memo(() => {
    if (unwrap(props.collapsed) ?? false) return false
    return unwrap(props.result) !== undefined
  })

  const renderer = toolRenderer(call.name)

  return bubble(
    { pending: props.pending, type: status },
    box(
      { flexDirection: "column" },
      renderer.call({ call, params, result: props.result }),
      // Optional description, dimmed
      desc ? text(({ style }) => style.dim(desc)) : undefined,
      show(
        {
          use: () =>
            log({
              content: memo(() => unwrap(props.result)?.error?.message ?? "Unknown error"),
              level: "error",
            }),
          when: isError,
        },
        {
          use: () => renderer.result({ call, params, result: props.result }),
          when: showResult,
        }
      )
    )
  )
})
