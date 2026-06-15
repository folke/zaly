import type { Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Accessor, InspectOpts, RenderCtx } from "@zaly/tui"
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
  result: Accessor<ToolResult | undefined>
  summary?: Accessor<boolean>
  pending?: Accessor<boolean>
}

export function toolPreview(tool: string, params: string | Record<string, unknown> = "") {
  return text((ctx) => renderToolCall(tool, { ...ctx, params }))
}

export function toolParams(
  params: unknown = "",
  opts: InspectOpts & { raw?: boolean; width?: number } = {}
) {
  const parsed = params ? (safeParseToolParams<Tool<Record<string, unknown>>>(params) ?? {}) : {}
  const p = parsed.path ?? parsed.command ?? parsed.url ?? parsed.pattern ?? parsed.glob ?? parsed
  const ret = typeof p === "string" && opts.raw ? p : inspect(p, { indent: 0, ...opts })
  return opts.width ? truncateAnsi(ret, opts.width) : ret
}

export function renderToolCall(tool: string, ctx: RenderCtx & { params?: unknown }) {
  const { style, width } = ctx
  const params = toolParams(ctx.params, { width: Math.min(80, width - tool.length - 2) })
  return `${style.primary.bold(tool)}(${params})`
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

  const renderer = toolRenderer(call.name)
  const toolCtx = { call, params, result: props.result }

  return bubble(
    { pending: props.pending, type: status },
    box(
      { flexDirection: "column" },
      toolPreview(call.name, params),
      // Optional description, dimmed
      desc ? text(({ style }) => style.dim(desc)) : undefined,
      show(
        { when: full },
        {
          use: () =>
            log({
              content: memo(() => props.result()?.error?.message ?? "Unknown error"),
              level: "error",
              visible: isError,
            }),
          when: isError,
        },
        () => renderer.result(toolCtx)
      )
    )
  )
})

export const toolCalls = widget((props: { calls: ToolCallProps[]; pending: Accessor<boolean> }) => {
  const pending = memo(() => props.pending() && props.calls.some((c) => c.result() === undefined))
  return box({}, ...props.calls.map((call) => toolCall({ ...call, summary: pending })))
})
