import type { Message, TokenCount, ToolCallPart, ToolResult } from "@zaly/ai"
import { ToolError } from "@zaly/ai"

/** Pull tool-call parts out of an assistant message. Returns `[]` for
 *  the string-content shorthand or a content array with no calls. */
export function extractToolCalls(
  message: Message<"assistant">,
): ToolCallPart[] {
  if (typeof message.content === "string") return []
  return message.content.filter((p): p is ToolCallPart => p.type === "tool-call")
}

/** Synthesize the tool-result payload returned when the model calls a
 *  tool that wasn't registered for this turn. The model sees a stable
 *  `UNKNOWN_TOOL` code and a human-readable message it can recover from. */
export function unknownToolResult(name: string): ToolResult {
  const err = new ToolError({
    code: "UNKNOWN_TOOL",
    message: `no tool named "${name}" is registered for this turn`,
  })
  return { isError: true, result: `❌ ${err.code}: ${err.message}` }
}

/** Sum two TokenCounts. Optional fields are only present in the result
 *  when at least one input had them set, so callers can tell "no
 *  reasoning happened this turn" apart from "0 reasoning tokens." */
export function addUsage(a: TokenCount, b: TokenCount): TokenCount {
  const out: TokenCount = {
    input: a.input + b.input,
    output: a.output + b.output,
  }
  if (a.cacheRead !== undefined || b.cacheRead !== undefined) {
    out.cacheRead = (a.cacheRead ?? 0) + (b.cacheRead ?? 0)
  }
  if (a.cacheWrite !== undefined || b.cacheWrite !== undefined) {
    out.cacheWrite = (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0)
  }
  if (a.reasoning !== undefined || b.reasoning !== undefined) {
    out.reasoning = (a.reasoning ?? 0) + (b.reasoning ?? 0)
  }
  return out
}
