import type { ToolCallPart, ToolResult } from "@zaly/ai"

import { stringifyContent } from "@zaly/ai"
import { box, inspect, signal, text } from "@zaly/tui"

/**
 * Tool-call block: name + intent on top, params preview, then a status
 * line that flips from "running" to ✓/✗ once the result arrives.
 */
export function toolCall(call: ToolCallPart): {
  node: ReturnType<typeof box>
  resolve: (result: ToolResult) => void
} {
  const [status, setStatus] = signal<"running" | "ok" | "error">("running")
  const [resultPreview, setResultPreview] = signal<string>("")

  const params = call.params as Record<string, unknown>
  const description = typeof params.description === "string" ? params.description : undefined
  const rest: Record<string, unknown> = { ...params }
  if (description) delete rest.description
  const json = inspect([rest])
  let preview = ""
  if (json !== "{}") preview = json.length > 200 ? `${json.slice(0, 197)}...` : json

  const node = box(
    { flexDirection: "column", padding: [0, 1, 1, 1] },
    text(({ style }) => {
      const s = status()
      if (s === "running") return `${style.dim("…")} ${style.primary(call.name)}`
      const icon = s === "ok" ? style.success("✓") : style.error("✗")
      return `${icon} ${style.primary(call.name)}`
    }),
    description ? text(({ style }) => style.dim(`  ${description}`)) : undefined,
    preview ? text(`  ${preview}`) : undefined,
    text(({ style }) => {
      const r = resultPreview()
      return r ? style.dim(r.replaceAll(/^/gm, "  ")) : ""
    })
  )

  return {
    node,
    resolve(result) {
      setStatus(result.isError ? "error" : "ok")
      const content = stringifyContent(result.content)
      const preview2 = content.length > 500 ? `${content.slice(0, 497)}...` : content
      setResultPreview(preview2)
    },
  }
}
