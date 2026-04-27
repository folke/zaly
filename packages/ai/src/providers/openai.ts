import type {
  FinishReason,
  Provider,
  ProviderRequest,
  ReasoningOptions,
  ResponseFormat,
  StreamEvent,
  TokenCount,
  ToolChoice,
} from "../provider.ts"
import type { AudioPart, ImagePart, Message, ProviderOptions, Quirks, Tool } from "../types.ts"

import { flattenMeta, hasAttachments, stringifyToolResult } from "../tools.ts"

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
    async *stream(req: ProviderRequest): AsyncIterable<StreamEvent> {
      const body = buildRequest(req)
      const response = await doFetch(`${baseUrl}/chat/completions`, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          ...auth(),
          ...config.headers,
        },
        method: "POST",
        signal: req.opts.signal,
      })
      if (!response.ok || response.body === null) {
        const text = await response.text().catch(() => "")
        throw new Error(`OpenAI ${response.status}: ${text || response.statusText}`)
      }
      yield* parseStream(response.body, req.quirks, req.opts.signal)
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

type OpenAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } }

function buildRequest(req: ProviderRequest): OpenAIChatRequest {
  const quirks = req.quirks ?? {}
  const { ctx, opts } = req
  const specific = (opts.providerOptions?.openai ?? {}) as OpenAIRequestOptions
  // flatMap because a single source message can produce multiple wire
  // messages — specifically, tool results with image/audio attachments
  // emit a tool message + a synthetic user message carrying the
  // attachments (Chat Completions tool messages are string-only).
  const messages = ctx.messages.flatMap(toOpenAIMessages)
  // Durable system prompt → first `role: "system"` message. Joined with
  // blank lines so multiple snippets read as separate paragraphs without
  // bleeding into each other.
  if (ctx.prompt && ctx.prompt.length > 0) {
    messages.unshift({ content: ctx.prompt.join("\n\n"), role: "system" })
  }
  const out: OpenAIChatRequest = {
    messages,
    model: req.model,
    stream: true,
    stream_options: { include_usage: true },
  }

  // Temperature: drop silently when quirks flag the model as rejecting it.
  if (opts.temperature !== undefined && quirks.temperatureSupported !== false) {
    out.temperature = opts.temperature
  }
  if (opts.maxTokens !== undefined) {
    const field = quirks.maxTokensField ?? "max_tokens"
    out[field] = opts.maxTokens
  }
  if (opts.stopSequences !== undefined) out.stop = opts.stopSequences

  if (ctx.tools !== undefined && ctx.tools.length > 0) {
    // `strictTools` at request level wins over quirks-level default.
    const strict = (opts.strictTools ?? quirks.strictTools) === true
    out.tools = ctx.tools.map((t) => toOpenAITool(t, strict))
    if (opts.toolChoice !== undefined) out.tool_choice = toOpenAIToolChoice(opts.toolChoice)
  }

  writeThinking(out, opts.reasoning?.effort, quirks)

  if (opts.responseFormat !== undefined) {
    out.response_format = toOpenAIResponseFormat(opts.responseFormat)
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
  choice: NonNullable<ToolChoice>
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

/** Translate one `ImagePart` to OpenAI's `image_url` content part.
 *  base64 sources pack into a `data:` URL; url sources pass through. */
function toOpenAIImagePart(part: ImagePart): OpenAIContentPart {
  const url =
    part.source.type === "url" ? part.source.url : `data:${part.mime};base64,${part.source.data}`
  return {
    image_url: { url, ...(part.detail ? { detail: part.detail } : {}) },
    type: "image_url",
  }
}

/** Translate one `AudioPart` to OpenAI's `input_audio` content part.
 *  Only available on the gpt-4o-audio-preview family of models. URL
 *  sources aren't accepted for audio — must be inline base64. */
function toOpenAIAudioPart(part: AudioPart): OpenAIContentPart {
  if (part.source.type !== "base64") {
    throw new Error(
      "OpenAI input_audio requires a base64 source — URL audio sources aren't accepted."
    )
  }
  const format = part.mime === "audio/wav" ? "wav" : "mp3"
  return { input_audio: { data: part.source.data, format }, type: "input_audio" }
}

function toOpenAIMessages(msg: Message): OpenAIMessage[] {
  // `role: "tool"` is special — Chat Completions requires one wire
  // message per `tool_call_id`, but the kernel's `Message<"tool">` packs
  // all the results from one parallel-tool batch into a single message
  // (one entry per result). Expand 1:N here. Other roles are 1:1 plus
  // optional attachment spillover.
  if (msg.role === "tool") {
    return [...msg.content.map(toolPartToWireMessage), ...attachmentSpilloverFor(msg)]
  }
  return [toOpenAIMessage(msg)]
}

function toolPartToWireMessage(part: Message<"tool">["content"][number]): OpenAIMessage {
  const body = stringifyToolResult(part.content)
  const marker = hasAttachments(part.content)
    ? "\n[attachments delivered as the next user message]"
    : ""
  return {
    content: (part.isError === true ? `ERROR: ${body}` : body) + marker,
    role: "tool",
    tool_call_id: part.id,
  }
}

/** When a `role: "tool"` message has rich content with non-text parts,
 *  Chat Completions can't carry them in the tool message itself. Emit
 *  a synthetic `role: "user"` message right after, holding just the
 *  attachments, so the model still sees them in conversation order. */
function attachmentSpilloverFor(msg: Message): OpenAIMessage[] {
  if (msg.role !== "tool") return []
  const out: OpenAIMessage[] = []
  for (const part of msg.content) {
    if (typeof part.content === "string") continue
    const attachments = part.content.filter((p) => p.type !== "text")
    if (attachments.length === 0) continue
    const userParts: OpenAIContentPart[] = []
    for (const att of attachments) {
      if (att.type === "image") userParts.push(toOpenAIImagePart(att))
      else if (att.type === "audio") userParts.push(toOpenAIAudioPart(att))
      // PDF / video aren't accepted on Chat Completions even via user
      // messages — drop with a text marker.
      else
        userParts.push({
          text: `[${att.type} attachment dropped; not accepted by this endpoint]`,
          type: "text",
        })
    }
    if (userParts.length > 0) out.push({ content: userParts, role: "user" })
  }
  return out
}

function toOpenAIMessage(msg: Message): OpenAIMessage {
  switch (msg.role) {
    case "system": {
      return { content: msg.content, role: "system" }
    }
    case "user": {
      if (typeof msg.content === "string") return { content: msg.content, role: "user" }
      // Flatten MetaPart → TextPart at the boundary so the loop below
      // only sees text + attachments.
      const flat = flattenMeta(msg.content)
      if (typeof flat === "string") return { content: flat, role: "user" }
      // (Text | Attachment)[] → content parts. Image attachments serialize
      // to `image_url`, with base64 sources packed as a `data:` URL. PDF /
      // audio / video attachments aren't supported on Chat Completions —
      // throw a clear error rather than silently dropping them.
      const parts: OpenAIContentPart[] = []
      for (const p of flat) {
        if (p.type === "text") parts.push({ text: p.text, type: "text" })
        else if (p.type === "image") parts.push(toOpenAIImagePart(p))
        else if (p.type === "audio") parts.push(toOpenAIAudioPart(p))
        else {
          // PDF/video aren't accepted by Chat Completions. (PDF lands on
          // OpenAI Responses; video isn't supported anywhere here.)
          throw new Error(
            `OpenAI Chat Completions does not accept ${p.type} attachments. ` +
              `Convert upstream or use a different provider/endpoint.`
          )
        }
      }
      return { content: parts, role: "user" }
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
      // Tool messages are expanded 1:N upstream in `toOpenAIMessages`.
      // This branch should never be reached at runtime — guard for
      // misuse if someone calls `toOpenAIMessage` directly.
      throw new Error("tool messages must be routed through toOpenAIMessages")
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
    // Strict type-guard: some OpenAI-compat proxies (notably Gemini's)
    // send `delta.content` as `null` or `0` during encrypted-thinking
    // phases. Forwarding those would concatenate "null"/"0" into the
    // text part. Drop anything that isn't a non-empty string.
    if (typeof delta?.content === "string" && delta.content !== "") {
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
 *  wins; otherwise we try the three known fields in order.
 *
 *  Coerced to `string | undefined` because providers don't all honour
 *  the documented shape — Gemini and some proxies surface
 *  `reasoning_details` as a structured object/array instead of a
 *  string. Returning a non-string would propagate into a
 *  `reasoning-delta` event and crash any consumer that writes it to a
 *  stream (e.g. `process.stdout.write`). Drop silently rather than
 *  guess at extraction; provider-specific quirks can supply a richer
 *  reader if needed. */
function readReasoningField(
  delta: OpenAIDelta | undefined,
  field: Quirks["reasoningField"]
): string | undefined {
  if (delta === undefined) return undefined
  const raw =
    field !== undefined
      ? delta[field]
      : (delta.reasoning ?? delta.reasoning_content ?? delta.reasoning_details)
  return typeof raw === "string" ? raw : undefined
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
