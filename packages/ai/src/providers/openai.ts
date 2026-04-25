import type {
  FinishReason,
  GenerateRequest,
  Provider,
  ReasoningOptions,
  ResponseFormat,
  StreamEvent,
  TokenCount,
} from "../provider.ts"
import type { Message, ProviderOptions, Quirks, Tool } from "../types.ts"

import { stringifyToolResult } from "../tools.ts"

/**
 * OpenAI Chat Completions adapter.
 *
 * Translates the core `Message` / `Tool` types into the Chat
 * Completions request shape, streams responses via SSE, and emits
 * normalised `StreamEvent`s.
 *
 * The Chat Completions shape is the common denominator for a wide
 * range of OpenAI-compatible endpoints (OpenRouter, DeepSeek, xAI,
 * MiniMax, Z.ai, Ollama, vLLM, …). Most use this adapter directly with
 * only `baseUrl` differing.
 */

/** Construct the OpenAI-family adapter. Everything about how to REACH
 *  the endpoint lives in `ProviderOptions`; everything about wire
 *  quirks (`max_tokens` vs `max_completion_tokens`, reasoning shape,
 *  effort-level clamp, …) lives in `Quirks` on the request and is
 *  read per-request, so the same adapter instance can safely serve
 *  models with different quirk profiles through a shared connection. */
export function createOpenAI(config: ProviderOptions = {}): Provider<"openai"> {
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")
  const doFetch = config.fetch ?? fetch

  const auth = (): Record<string, string> =>
    config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}

  return {
    id: "openai",
    async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
      const body = buildRequest(req)
      const response = await doFetch(`${baseUrl}/chat/completions`, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          ...auth(),
          ...config.headers,
        },
        method: "POST",
        signal: req.signal,
      })
      if (!response.ok || response.body === null) {
        const text = await response.text().catch(() => "")
        throw new Error(`OpenAI ${response.status}: ${text || response.statusText}`)
      }
      yield* parseStream(response.body, req.quirks, req.signal)
    },
  }
}

// ── Request translation ──────────────────────────────────────────────────

interface OpenAIChatRequest {
  model: string
  messages: OpenAIMessage[]
  stream: true
  stream_options: { include_usage: true }
  tools?: OpenAITool[]
  tool_choice?: "auto" | "required" | "none" | { type: "function"; function: { name: string } }
  temperature?: number
  // Either `max_tokens` (legacy + third-party) or
  // `max_completion_tokens` (new + reasoning models) is set, never
  // both — see `OpenAIConfig.maxTokensField`.
  max_tokens?: number
  max_completion_tokens?: number
  stop?: string[]
  reasoning_effort?: "minimal" | "low" | "medium" | "high"
  // `thinkingFormat: "openrouter"` puts effort under `reasoning`, not
  // `reasoning_effort`. See quirks.thinkingFormat.
  reasoning?: { effort: "minimal" | "low" | "medium" | "high" }
  // `thinkingFormat: "deepseek"` adds a thinking toggle alongside
  // reasoning_effort.
  thinking?: { type: "enabled" | "disabled" }
  // `thinkingFormat: "zai" | "qwen"` — top-level boolean toggle.
  enable_thinking?: boolean
  // `thinkingFormat: "qwen-chat-template"` — tucked under chat-template kwargs.
  chat_template_kwargs?: { enable_thinking?: boolean }
  response_format?:
    | { type: "json_object" }
    | {
        type: "json_schema"
        json_schema: { name: string; schema: unknown; strict?: boolean }
      }
  parallel_tool_calls?: boolean
  seed?: number
  user?: string
  service_tier?: "auto" | "default" | "flex" | "priority"
  logit_bias?: Record<string, number>
}

interface OpenAIRequestOptions {
  parallelToolCalls?: boolean
  seed?: number
  user?: string
  serviceTier?: "auto" | "default" | "flex" | "priority"
  logitBias?: Record<string, number>
}

interface OpenAITool {
  type: "function"
  function: {
    name: string
    description?: string
    parameters: unknown
    strict?: boolean
  }
}

type OpenAIMessage =
  | { role: "system" | "developer"; content: string }
  | { role: "user"; content: string | OpenAIContentPart[] }
  | {
      role: "assistant"
      // Omitted (not `null`) when the message only carries tool_calls.
      // Chat Completions accepts either, and absent keeps us on the
      // no-null side of the lint rule.
      content?: string
      tool_calls?: {
        id: string
        type: "function"
        function: { name: string; arguments: string }
      }[]
    }
  | { role: "tool"; tool_call_id: string; content: string }

interface OpenAIContentPart {
  type: "text"
  text: string
}

function buildRequest(req: GenerateRequest): OpenAIChatRequest {
  const quirks = req.quirks ?? {}
  const specific = (req.providerOptions?.openai ?? {}) as OpenAIRequestOptions
  const messages = req.messages.map(toOpenAIMessage)
  // Durable system prompt → first `role: "system"` message. Joined with
  // blank lines so multiple snippets read as separate paragraphs without
  // bleeding into each other.
  if (req.prompt && req.prompt.length > 0) {
    messages.unshift({ content: req.prompt.join("\n\n"), role: "system" })
  }
  const out: OpenAIChatRequest = {
    messages,
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
  }

  // Temperature: drop silently when quirks flag the model as rejecting it.
  if (req.temperature !== undefined && quirks.temperatureSupported !== false) {
    out.temperature = req.temperature
  }
  if (req.maxTokens !== undefined) {
    const field = quirks.maxTokensField ?? "max_tokens"
    out[field] = req.maxTokens
  }
  if (req.stopSequences !== undefined) out.stop = req.stopSequences

  if (req.tools !== undefined && req.tools.length > 0) {
    // `strictTools` at request level wins over quirks-level default.
    const strict = (req.strictTools ?? quirks.strictTools) === true
    out.tools = req.tools.map((t) => toOpenAITool(t, strict))
    if (req.toolChoice !== undefined) out.tool_choice = toOpenAIToolChoice(req.toolChoice)
  }

  writeThinking(out, req.reasoning?.effort, quirks)

  if (req.responseFormat !== undefined) {
    out.response_format = toOpenAIResponseFormat(req.responseFormat)
  }

  if (specific.parallelToolCalls !== undefined) out.parallel_tool_calls = specific.parallelToolCalls
  if (specific.seed !== undefined) out.seed = specific.seed
  if (specific.user !== undefined) out.user = specific.user
  if (specific.serviceTier !== undefined) out.service_tier = specific.serviceTier
  if (specific.logitBias !== undefined) out.logit_bias = specific.logitBias
  return out
}

/** Dispatch reasoning effort across the five known "thinking" wire
 *  formats. Reads `quirks.thinkingFormat` (default `"openai"`) and
 *  `quirks.reasoningLevels` for model-specific level support.
 *
 *  `effort === "off"` uniformly disables thinking where the provider
 *  has an explicit toggle (`deepseek`, `zai`, `qwen`); on `"openai"`
 *  it omits the field (models that always reason ignore this). */
function writeThinking(
  out: OpenAIChatRequest,
  effort: ReasoningOptions["effort"],
  quirks: Quirks
): void {
  const format = quirks.thinkingFormat ?? "openai"
  const clamped = clampEffort(effort, quirks.reasoningLevels)

  if (clamped === "off" || clamped === undefined) {
    if (format === "deepseek") out.thinking = { type: "disabled" }
    else if (format === "zai" || format === "qwen") out.enable_thinking = false
    else if (format === "qwen-chat-template") out.chat_template_kwargs = { enable_thinking: false }
    // "openai" / "openrouter": omit. Models default per the catalog.
    return
  }

  // `xhigh` collapses to `"high"` on every OpenAI-shaped wire.
  const native = clamped === "xhigh" ? "high" : clamped
  switch (format) {
    case "openai": {
      out.reasoning_effort = native
      return
    }
    case "openrouter": {
      out.reasoning = { effort: native }
      return
    }
    case "deepseek": {
      out.thinking = { type: "enabled" }
      out.reasoning_effort = native
      return
    }
    case "zai":
    case "qwen": {
      out.enable_thinking = true
      return
    }
    case "qwen-chat-template": {
      out.chat_template_kwargs = { enable_thinking: true }
      return
    }
  }
}

/** Clamp the requested effort to the nearest level this model accepts.
 *  Levels are ordered by cost; anything above the highest supported is
 *  lowered to the ceiling, anything below the lowest supported is
 *  raised to the floor. `"off"` passes through when it's in the list,
 *  otherwise falls to the lowest positive level. */
function clampEffort(
  effort: ReasoningOptions["effort"],
  levels: Quirks["reasoningLevels"]
): ReasoningOptions["effort"] | undefined {
  if (effort === undefined) return undefined
  if (levels === undefined) return effort
  if (levels.includes(effort)) return effort
  if (effort === "off") {
    const nonOff = levels.find((l) => l !== "off")
    return nonOff
  }
  const ordered: (typeof effort)[] = ["minimal", "low", "medium", "high", "xhigh"]
  const requestedIdx = ordered.indexOf(effort)
  // Walk down to the next supported level below.
  for (let i = requestedIdx; i >= 0; i--) {
    if (levels.includes(ordered[i])) return ordered[i]
  }
  // Nothing below — pick the lowest supported (above off).
  return levels.find((l) => l !== "off") ?? effort
}

function toOpenAIToolChoice(
  choice: NonNullable<GenerateRequest["toolChoice"]>
): NonNullable<OpenAIChatRequest["tool_choice"]> {
  if (typeof choice === "string") return choice
  return { function: { name: choice.name }, type: "function" }
}

function toOpenAIResponseFormat(
  format: ResponseFormat
): NonNullable<OpenAIChatRequest["response_format"]> {
  if (format.type === "json") return { type: "json_object" }
  return {
    json_schema: { name: format.name, schema: format.schema, strict: format.strict },
    type: "json_schema",
  }
}

function toOpenAITool(tool: Tool, strict: boolean): OpenAITool {
  return {
    function: {
      description: tool.desc,
      name: tool.name,
      parameters: tool.params,
      ...(strict ? { strict: true } : {}),
    },
    type: "function",
  }
}

function toOpenAIMessage(msg: Message): OpenAIMessage {
  switch (msg.role) {
    case "system": {
      return { content: msg.content, role: "system" }
    }
    case "user": {
      if (typeof msg.content === "string") return { content: msg.content, role: "user" }
      // TextPart[] → content parts. Chat Completions accepts parts for
      // multimodal input; we only emit `text` parts today (images land
      // when we add multimodal support to the core types).
      return {
        content: msg.content.map((p) => ({ text: p.text, type: "text" as const })),
        role: "user",
      }
    }
    case "assistant": {
      if (typeof msg.content === "string") return { content: msg.content, role: "assistant" }
      // Flatten the ordered part array: concatenate all text, bucket
      // all tool-call parts. Reasoning parts are dropped — Chat
      // Completions has no way to send reasoning back to the model,
      // and OpenAI's own reasoning models strip them from prior turns
      // anyway. If we later target the Responses API, reasoning
      // round-trips there.
      const textChunks: string[] = []
      const toolCalls: NonNullable<Extract<OpenAIMessage, { role: "assistant" }>["tool_calls"]> = []
      for (const part of msg.content) {
        if (part.type === "text") textChunks.push(part.text)
        else if (part.type === "tool-call") {
          toolCalls.push({
            function: { arguments: JSON.stringify(part.params ?? {}), name: part.name },
            id: part.id,
            type: "function",
          })
        }
      }
      const out: Extract<OpenAIMessage, { role: "assistant" }> = { role: "assistant" }
      if (textChunks.length > 0) out.content = textChunks.join("")
      if (toolCalls.length > 0) out.tool_calls = toolCalls
      return out
    }
    case "tool": {
      // One `role: "tool"` message per result. Callers that pack
      // multiple results into one Message get split here.
      if (msg.content.length === 0) {
        throw new Error("tool message requires at least one tool-result part")
      }
      // Adapter emits the first — the kernel is expected to emit one
      // `role: "tool"` Message per tool result upstream. This keeps
      // the 1:1 invariant with OpenAI's shape without silent merges.
      const part = msg.content[0]
      const body = stringifyToolResult(part.result)
      return {
        content: part.isError === true ? `ERROR: ${body}` : body,
        role: "tool",
        tool_call_id: part.id,
      }
    }
    default: {
      // Exhaustiveness guard — `msg` is `never` here if every role
      // above is handled.
      const _exhaustive: never = msg
      throw new Error(`Unhandled message role: ${(_exhaustive as { role: string }).role}`)
    }
  }
}

// ── SSE parsing ──────────────────────────────────────────────────────────

/** Parse an SSE response body into our `StreamEvent` union. OpenAI
 *  sends one `data: { ... }` JSON object per chunk and a final
 *  `data: [DONE]`. Tool calls stream as per-index `tool_calls[i]`
 *  fragments with `function.arguments` as a JSON *string* growing
 *  char-by-char — we accumulate and JSON-parse on completion.
 *
 *  `signal` is polled around each read because some runtimes (Bun's
 *  fetch, as of 1.3) close the body stream gracefully on abort
 *  instead of errorring the reader — so we'd otherwise emit a clean
 *  `finish` rather than propagating the abort. Checking the flag
 *  explicitly makes the contract uniform across runtimes. */
async function* parseStream(
  body: ReadableStream<Uint8Array>,
  quirks: Quirks | undefined,
  signal?: AbortSignal
): AsyncIterable<StreamEvent> {
  const decoder = new TextDecoder()
  let buffer = ""
  const pendingToolCalls = new Map<number, { id: string; name: string; argsBuffer: string }>()
  let usage: TokenCount = { input: 0, output: 0 }
  let finishReason: FinishReason = "other"
  let finished = false

  const reader = body.getReader()
  try {
    for (;;) {
      if (signal?.aborted) throw abortError()
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (signal?.aborted) throw abortError()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line. Process complete
      // events; leave any trailing partial event in the buffer.
      let idx = buffer.indexOf("\n\n")
      while (idx !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const evt = parseSseEvent(raw)
        if (evt !== undefined) {
          for (const streamEvent of handleChunk(evt, pendingToolCalls, quirks)) {
            if (streamEvent.type === "finish") {
              finishReason = streamEvent.finishReason
              usage = streamEvent.usage
              finished = true
            } else {
              yield streamEvent
            }
          }
        }
        idx = buffer.indexOf("\n\n")
      }
    }
  } finally {
    reader.releaseLock()
  }

  // Flush any accumulated tool calls as complete events before `finish`.
  for (const [, pending] of pendingToolCalls) {
    yield {
      id: pending.id,
      name: pending.name,
      params: safeParseJson(pending.argsBuffer),
      type: "tool-call",
    }
  }
  if (!finished) {
    // Stream ended without a finish chunk — still emit one so collect()
    // sees terminal state.
    finishReason = "other"
  }
  yield { finishReason, type: "finish", usage }
}

/** Extract the `data:` payload from one SSE event block; returns
 *  `undefined` for comments, empty events, or the `[DONE]` sentinel. */
function parseSseEvent(block: string): unknown {
  const lines = block.split("\n")
  let data = ""
  for (const line of lines) {
    if (line.startsWith("data:")) {
      data += line.slice(5).trimStart()
    }
  }
  if (data === "" || data === "[DONE]") return undefined
  try {
    return JSON.parse(data)
  } catch {
    return undefined
  }
}

interface OpenAIChunk {
  choices?: {
    delta?: OpenAIDelta
    finish_reason?: string | null
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

interface OpenAIDelta {
  content?: string
  // Reasoning text — different providers use different fields.
  // `reasoningField` in `Quirks` picks when known.
  reasoning?: string
  reasoning_content?: string
  reasoning_details?: string
  tool_calls?: {
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  }[]
}

function* handleChunk(
  raw: unknown,
  pendingToolCalls: Map<number, { id: string; name: string; argsBuffer: string }>,
  quirks: Quirks | undefined
): Iterable<StreamEvent> {
  const chunk = raw as OpenAIChunk
  const choice = chunk.choices?.[0]
  if (choice !== undefined) {
    const delta = choice.delta
    const reasoningDelta = readReasoningField(delta, quirks?.reasoningField)
    if (reasoningDelta !== undefined && reasoningDelta !== "") {
      yield { delta: reasoningDelta, type: "reasoning-delta" }
    }
    if (delta?.content !== undefined && delta.content !== "") {
      yield { delta: delta.content, type: "text-delta" }
    }
    if (delta?.tool_calls !== undefined) {
      for (const tc of delta.tool_calls) {
        let entry = pendingToolCalls.get(tc.index)
        if (entry === undefined) {
          entry = { argsBuffer: "", id: tc.id ?? "", name: tc.function?.name ?? "" }
          pendingToolCalls.set(tc.index, entry)
        } else {
          if (tc.id !== undefined) entry.id = tc.id
          if (tc.function?.name !== undefined) entry.name = tc.function.name
        }
        if (tc.function?.arguments !== undefined) entry.argsBuffer += tc.function.arguments
      }
    }
    if (choice.finish_reason !== undefined && choice.finish_reason !== null) {
      // Emit tool calls accumulated for this choice before signalling
      // finish. Leaving them in the Map would cause a second flush at
      // end-of-stream after `finish`, violating event ordering.
      for (const [index, pending] of pendingToolCalls) {
        yield {
          id: pending.id,
          name: pending.name,
          params: safeParseJson(pending.argsBuffer),
          type: "tool-call",
        }
        pendingToolCalls.delete(index)
      }
      yield {
        finishReason: mapFinishReason(choice.finish_reason),
        type: "finish",
        usage: {
          input: chunk.usage?.prompt_tokens ?? 0,
          output: chunk.usage?.completion_tokens ?? 0,
          ...(chunk.usage?.prompt_tokens_details?.cached_tokens !== undefined
            ? { cacheRead: chunk.usage.prompt_tokens_details.cached_tokens }
            : {}),
        },
      }
    }
  } else if (chunk.usage !== undefined) {
    // Final usage chunk arrives after the choice block on some
    // deployments (`stream_options: { include_usage: true }`). Emit a
    // synthetic finish if we haven't seen one — real finish already
    // consumed the usage otherwise.
    yield {
      finishReason: "stop",
      type: "finish",
      usage: {
        input: chunk.usage.prompt_tokens ?? 0,
        output: chunk.usage.completion_tokens ?? 0,
        ...(chunk.usage.prompt_tokens_details?.cached_tokens !== undefined
          ? { cacheRead: chunk.usage.prompt_tokens_details.cached_tokens }
          : {}),
      },
    }
  }
}

function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case "stop": {
      return "stop"
    }
    case "length": {
      return "length"
    }
    case "tool_calls":
    case "function_call": {
      return "tool-calls"
    }
    case "content_filter": {
      return "content-filter"
    }
    default: {
      return "other"
    }
  }
}

/** Read the streaming reasoning delta from whichever field this
 *  provider uses. When `reasoningField` is set in quirks, that field
 *  wins; otherwise we try the three known fields in order. */
function readReasoningField(
  delta: OpenAIDelta | undefined,
  field: Quirks["reasoningField"]
): string | undefined {
  if (delta === undefined) return undefined
  if (field !== undefined) return delta[field]
  return delta.reasoning ?? delta.reasoning_content ?? delta.reasoning_details
}

function abortError(): Error {
  const e = new Error("aborted")
  e.name = "AbortError"
  return e
}

function safeParseJson(s: string): unknown {
  if (s === "") return {}
  try {
    return JSON.parse(s)
  } catch {
    // Hand the raw string back — the harness will fail validation and
    // surface a readable error to the model for self-correction.
    return s
  }
}
