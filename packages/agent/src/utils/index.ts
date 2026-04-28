import type { Message, TokenCount, ToolCallPart } from "@zaly/ai"

export * from "./output.ts"

/** Pull tool-call parts out of an assistant message. Returns `[]` for
 *  the string-content shorthand or a content array with no calls. */
export function extractToolCalls(message: Message<"assistant">): ToolCallPart[] {
  if (typeof message.content === "string") return []
  return message.content.filter((p): p is ToolCallPart => p.type === "tool-call")
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
