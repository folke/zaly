// oxlint-disable no-await-in-loop
import type {
  CollectOptions,
  FinishReason,
  GenerateRequest,
  Message,
  Model,
  TokenCount,
  Tool,
  ToolCallPart,
  ToolResult,
  ToolResultPart,
} from "@zaly/ai"
import { collect, isContextOverflow, runTool, ToolError } from "@zaly/ai"
import type { LoopDetector } from "./looping.ts"

/** Input for `runAgentTurn`. The `Model` knows its provider, local id,
 *  and quirks; the loop just threads conversation state and forwards
 *  request-level knobs (reasoning, tool choice, temperature, etc.).
 *  Custom providers go through the catalog (`addModels` /
 *  `registerAdapter`) and arrive here as `Model` like any other.
 *
 *  `onEvent` / `onMessage` mirror the callback shape on `collect`: they
 *  fire as the turn runs but never block the stream. */
export interface RunAgentOptions extends CollectOptions {
  model: Model
  request: Omit<GenerateRequest, "model">
  /** Hard ceiling on provider round-trips. Prevents runaway tool loops
   *  when the model refuses to stop calling tools. Default: 50. */
  maxIterations?: number
  /** Cumulative token cap across the whole turn (`usage.input +
   *  usage.output` summed across iterations). Distinct from
   *  `request.maxTokens`, which caps a single response. When the
   *  budget is exceeded, the loop stops with `stopReason: "token-budget"`. */
  tokenBudget?: number
  /** Bail out after this many consecutive failing tool calls. A
   *  successful tool call resets the streak. Use to stop wedged
   *  agents that can't recover from a broken tool. */
  maxToolErrors?: number
  /** Model's declared context window. When set, after each successful
   *  iteration the loop checks `usage.input + usage.cachedInput`
   *  against this and stops with `stopReason: "context-overflow"` on
   *  silent overflow (provider accepted but truncated). The reactive
   *  error-message check runs unconditionally — this is only for the
   *  proactive arm. */
  contextLimit?: number
  /** Predicate over the running tool-call history. When it returns
   *  true the loop stops with `stopReason: "loop-detected"`. Use
   *  `createLoopDetector` from `./utils` for the default heuristics. */
  loopDetector?: LoopDetector
  /** Called after each completed sub-stream with the assembled
   *  assistant message + any tool messages appended in this iteration. */
  onMessage?: (message: Message) => void | Promise<unknown>
  /** Called after each tool execution — useful for UI / telemetry that
   *  wants to show per-call status without reconstructing from
   *  `onMessage`. */
  onToolResult?: (call: ToolCallPart, result: ToolResult) => void | Promise<unknown>
}

/** Outcome of one agent turn — the delta of messages produced, a
 *  stop-reason discriminator, and summed usage across every provider
 *  call in the loop. The original request messages are *not* included
 *  in `messages` so callers can append directly onto their existing
 *  conversation. */
export interface AgentTurnResult {
  /** Last provider finishReason (the one that ended the loop). */
  finishReason: FinishReason
  /** Number of provider round-trips executed. */
  iterations: number
  /** Assistant + tool messages produced during this turn. */
  messages: Message[]
  /** Why the loop terminated:
   *  - `natural`         — model returned without a tool call
   *  - `max-iterations`  — hit `maxIterations`; model may still want more
   *  - `token-budget`    — summed usage exceeded `tokenBudget`
   *  - `loop-detected`   — `loopDetector` flagged repetition
   *  - `max-tool-errors` — too many consecutive failing tool calls
   *  - `context-overflow`— request overflowed the context window
   *  - `error`           — a non-recoverable error; see `error` */
  stopReason:
    | "natural"
    | "max-iterations"
    | "token-budget"
    | "loop-detected"
    | "max-tool-errors"
    | "context-overflow"
    | "error"
  /** Summed token usage across every provider call. */
  usage: TokenCount
  /** Present only when `stopReason === "error"`. */
  error?: Error
}

/**
 * Run a full agent turn: repeatedly stream from the provider, execute
 * any tool calls the model emits, and feed the results back in —
 * until the model stops calling tools, an error occurs, or
 * `maxIterations` is reached.
 *
 * Design notes:
 *   - One provider call per iteration. Tool calls within a single
 *     stream all execute before the next iteration; we send one
 *     consolidated `tool` message back.
 *   - Tool failures (invalid input, thrown ToolError, unknown tool)
 *     become `isError: true` tool-results and the loop continues —
 *     the model is expected to read them and retry / recover.
 *   - Usage is summed across iterations, so the outer scheduler sees
 *     the real cost of the turn, not just the last round-trip.
 */
export async function runAgentTurn(opts: RunAgentOptions): Promise<AgentTurnResult> {
  const maxIterations = opts.maxIterations ?? 50
  const toolIndex = new Map<string, Tool>()
  for (const t of opts.request.tools ?? []) toolIndex.set(t.name, t)

  const produced: Message[] = []
  const conversation: Message[] = [...opts.request.messages]
  const callHistory: ToolCallPart[] = []
  let usage: TokenCount = { input: 0, output: 0 }
  let iterations = 0
  let consecutiveErrors = 0
  let finishReason: FinishReason = "other"

  while (iterations < maxIterations) {
    iterations++
    let collected
    try {
      const stream = opts.model.stream({ ...opts.request, messages: conversation })
      collected = await collect(stream, { onEvent: opts.onEvent, onUpdate: opts.onUpdate })
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const overflow = isContextOverflow({ message: err.message })
      return {
        error: err,
        finishReason: overflow ? "length" : "error",
        iterations,
        messages: produced,
        stopReason: overflow ? "context-overflow" : "error",
        usage,
      }
    }

    usage = addUsage(usage, collected.usage)
    finishReason = collected.finishReason
    produced.push(collected.message)
    conversation.push(collected.message)
    await opts.onMessage?.(collected.message)

    if (
      opts.contextLimit !== undefined &&
      isContextOverflow({
        contextLimit: opts.contextLimit,
        usageInput: collected.usage.input + (collected.usage.cachedInput ?? 0),
      })
    ) {
      return { finishReason, iterations, messages: produced, stopReason: "context-overflow", usage }
    }

    const toolCalls = extractToolCalls(collected.message)
    if (toolCalls.length === 0) {
      return {
        finishReason,
        iterations,
        messages: produced,
        stopReason: "natural",
        usage,
      }
    }

    const resultParts: ToolResultPart[] = []
    for (const call of toolCalls) {
      const tool = toolIndex.get(call.name)
      const result = tool ? await runTool(tool, call.params) : unknownToolResult(call.name)
      await opts.onToolResult?.(call, result)
      resultParts.push({
        id: call.id,
        isError: result.isError,
        name: call.name,
        result: result.result,
        type: "tool-result",
      })
      callHistory.push(call)
      consecutiveErrors = result.isError ? consecutiveErrors + 1 : 0
    }

    const toolMessage: Message = { content: resultParts, role: "tool" }
    produced.push(toolMessage)
    conversation.push(toolMessage)
    await opts.onMessage?.(toolMessage)

    if (opts.loopDetector?.(callHistory) === true) {
      return { finishReason, iterations, messages: produced, stopReason: "loop-detected", usage }
    }
    if (opts.maxToolErrors !== undefined && consecutiveErrors >= opts.maxToolErrors) {
      return { finishReason, iterations, messages: produced, stopReason: "max-tool-errors", usage }
    }
    if (opts.tokenBudget !== undefined && usage.input + usage.output > opts.tokenBudget) {
      return { finishReason, iterations, messages: produced, stopReason: "token-budget", usage }
    }
  }

  return {
    finishReason,
    iterations,
    messages: produced,
    stopReason: "max-iterations",
    usage,
  }
}

function extractToolCalls(message: Extract<Message, { role: "assistant" }>): ToolCallPart[] {
  if (typeof message.content === "string") return []
  return message.content.filter((p): p is ToolCallPart => p.type === "tool-call")
}

function unknownToolResult(name: string): ToolResult {
  const err = new ToolError({
    code: "UNKNOWN_TOOL",
    message: `no tool named "${name}" is registered for this turn`,
  })
  return { isError: true, result: `❌ ${err.code}: ${err.message}` }
}

function addUsage(a: TokenCount, b: TokenCount): TokenCount {
  const out: TokenCount = {
    input: a.input + b.input,
    output: a.output + b.output,
  }
  if (a.cachedInput !== undefined || b.cachedInput !== undefined) {
    out.cachedInput = (a.cachedInput ?? 0) + (b.cachedInput ?? 0)
  }
  if (a.reasoning !== undefined || b.reasoning !== undefined) {
    out.reasoning = (a.reasoning ?? 0) + (b.reasoning ?? 0)
  }
  return out
}
