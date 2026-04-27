import type {
  FinishReason,
  GenerateRequest,
  Provider,
  ReasoningOptions,
  StreamEvent,
  TokenCount,
} from "../provider.ts"
import type {
  Attachment,
  CacheHint,
  ImagePart,
  Message,
  PdfPart,
  ProviderOptions,
  TextPart,
  Tool,
} from "../types.ts"


/**
 * Anthropic Messages API adapter.
 *
 * Translates the core `Message` / `Tool` types into the `/v1/messages`
 * request shape, streams responses via SSE, and emits normalised
 * `StreamEvent`s.
 *
 * Scope of this adapter (v0):
 *   - text + tool messages, streaming, tool calls, usage/cost
 *   - prompt caching (`cache_control: { type: "ephemeral" }`)
 *   - extended thinking via `reasoning.effort` / `reasoning.budget`
 *
 * Deferred:
 *   - image / PDF content parts
 *   - image-bearing tool results
 *   - server-side tools (computer-use, web_search, …)
 *   - `response_format` (Anthropic has no JSON mode — use tools)
 */
export function createAnthropic(config: ProviderOptions = {}): Provider<"anthropic"> {
  const baseUrl = (config.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "")
  const doFetch = config.fetch ?? fetch
  const caching = config.caching !== false

  const auth = (): Record<string, string> => (config.apiKey ? { "x-api-key": config.apiKey } : {})

  return {
    id: "anthropic",
    async *stream(req: GenerateRequest): AsyncIterable<StreamEvent> {
      const body = buildRequest(req, caching)
      const response = await doFetch(`${baseUrl}/messages`, {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...auth(),
          ...config.headers,
        },
        method: "POST",
        signal: req.signal,
      })
      if (!response.ok || response.body === null) {
        const text = await response.text().catch(() => "")
        throw new Error(`Anthropic ${response.status}: ${text || response.statusText}`)
      }
      yield* parseStream(response.body, req.signal)
    },
  }
}

// ── Request translation ──────────────────────────────────────────────────

interface AnthropicRequest {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: string | AnthropicTextBlock[]
  tools?: AnthropicTool[]
  tool_choice?: { type: "auto" | "any" | "none" } | { type: "tool"; name: string }
  temperature?: number
  stop_sequences?: string[]
  thinking?: { type: "enabled"; budget_tokens: number }
  metadata?: { user_id?: string }
  stream: true
}

interface AnthropicTextBlock {
  type: "text"
  text: string
  cache_control?: { type: "ephemeral" }
}

interface AnthropicThinkingBlock {
  type: "thinking"
  thinking: string
  signature?: string
}

interface AnthropicToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: unknown
}

interface AnthropicToolResultBlock {
  type: "tool_result"
  tool_use_id: string
  /** Anthropic accepts either a string (legacy/simple) or an array of
   *  text + image blocks. Document/PDF blocks are not allowed inside
   *  tool_result; PDFs in tool results degrade to text placeholders. */
  content: string | (AnthropicTextBlock | AnthropicImageBlock)[]
  is_error?: boolean
  cache_control?: { type: "ephemeral" }
}

interface AnthropicImageBlock {
  type: "image"
  source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string }
  cache_control?: { type: "ephemeral" }
}

interface AnthropicDocumentBlock {
  type: "document"
  source:
    | { type: "base64"; media_type: "application/pdf"; data: string }
    | { type: "url"; url: string }
  cache_control?: { type: "ephemeral" }
}

type AnthropicContentBlock =
  | AnthropicDocumentBlock
  | AnthropicImageBlock
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock

interface AnthropicMessage {
  role: "user" | "assistant"
  content: AnthropicContentBlock[]
}

interface AnthropicTool {
  name: string
  description?: string
  input_schema: unknown
  cache_control?: { type: "ephemeral" }
}

interface AnthropicRequestOptions {
  userId?: string
  /** Cache the trailing tool definition. Adapter uses this when the
   *  harness wants the tool block cached but isn't carrying a per-tool
   *  hint (which we don't model in the core `Tool` type). */
  cacheTools?: boolean
}

function buildRequest(req: GenerateRequest, caching: boolean): AnthropicRequest {
  const specific = (req.providerOptions?.anthropic ?? {}) as AnthropicRequestOptions
  // Anthropic requires max_tokens. Fall back to a generous default if
  // the caller didn't set one — `Model.stream` fills this from
  // `limit.output` for catalog-routed calls.
  const maxTokens = req.maxTokens ?? 4096

  // Pull out role:"system" messages and merge with `prompt[]` into the
  // top-level `system` slot. Both are durable system context on the
  // wire; Anthropic doesn't support mid-conversation system messages.
  const systemBlocks: AnthropicTextBlock[] = []
  const conversational: Message[] = []
  for (const msg of req.messages) {
    if (msg.role === "system") {
      systemBlocks.push(asTextBlock(msg.content, caching ? msg.cache : undefined))
    } else {
      conversational.push(msg)
    }
  }
  if (req.prompt && req.prompt.length > 0) {
    // Durable prompt prepends — same ordering rule as the OpenAI adapter.
    systemBlocks.unshift(...req.prompt.map((text) => ({ text, type: "text" as const })))
  }

  const out: AnthropicRequest = {
    max_tokens: maxTokens,
    messages: toAnthropicMessages(conversational, caching),
    model: req.model,
    stream: true,
  }

  if (systemBlocks.length > 0) {
    // String shorthand only when there's a single un-cached block.
    out.system =
      systemBlocks.length === 1 && systemBlocks[0].cache_control === undefined
        ? systemBlocks[0].text
        : systemBlocks
  }

  if (req.temperature !== undefined) out.temperature = req.temperature
  if (req.stopSequences !== undefined) out.stop_sequences = req.stopSequences

  if (req.tools !== undefined && req.tools.length > 0) {
    out.tools = req.tools.map((t) => toAnthropicTool(t))
    if (specific.cacheTools === true && caching) {
      // Marker on the last tool covers all tools above it in the cache
      // prefix, per Anthropic's caching rules.
      out.tools[out.tools.length - 1].cache_control = { type: "ephemeral" }
    }
    if (req.toolChoice !== undefined) out.tool_choice = toAnthropicToolChoice(req.toolChoice)
  }

  const thinking = thinkingBudget(req.reasoning, maxTokens)
  if (thinking !== undefined) out.thinking = thinking

  if (specific.userId !== undefined) out.metadata = { user_id: specific.userId }
  return out
}

function asTextBlock(text: string, cache: CacheHint | undefined): AnthropicTextBlock {
  const block: AnthropicTextBlock = { text, type: "text" }
  if (cache !== undefined) block.cache_control = { type: "ephemeral" }
  return block
}

function toAnthropicTool(tool: Tool): AnthropicTool {
  return {
    description: tool.desc,
    input_schema: tool.params,
    name: tool.name,
  }
}

function toAnthropicToolChoice(
  choice: NonNullable<GenerateRequest["toolChoice"]>
): NonNullable<AnthropicRequest["tool_choice"]> {
  if (choice === "auto") return { type: "auto" }
  if (choice === "required") return { type: "any" }
  if (choice === "none") return { type: "none" }
  return { name: choice.name, type: "tool" }
}

/** Translate `reasoning.effort` (and optional explicit `budget`) into
 *  Anthropic's `thinking.budget_tokens`. Effort levels follow the same
 *  monotonic ordering used elsewhere; budgets are coarse buckets that
 *  have proven reasonable in practice. `budget_tokens` must be < max_tokens. */
function thinkingBudget(
  reasoning: ReasoningOptions | undefined,
  maxTokens: number
): AnthropicRequest["thinking"] {
  if (reasoning === undefined) return undefined
  if (reasoning.effort === "off") return undefined
  let budget = reasoning.budget
  if (budget === undefined) {
    switch (reasoning.effort) {
      case undefined: {
        return undefined
      }
      case "minimal": {
        budget = 1024
        break
      }
      case "low": {
        budget = 4096
        break
      }
      case "medium": {
        budget = 8192
        break
      }
      case "high": {
        budget = 16_384
        break
      }
      case "xhigh": {
        budget = 32_768
        break
      }
    }
  }
  // Anthropic requires budget < max_tokens; clamp with a small headroom
  // so the model can still produce a final answer.
  const clamped = Math.min(budget, Math.max(1024, maxTokens - 1))
  return { budget_tokens: clamped, type: "enabled" }
}

function toAnthropicMessages(messages: Message[], caching: boolean): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const msg of messages) {
    if (msg.role === "system") {
      // Filtered upstream — keep the guard so future refactors fail fast.
      throw new Error("system messages must be hoisted to top-level system field")
    }
    const block = toAnthropicMessage(msg)
    // Coalesce consecutive same-role messages. Anthropic enforces strict
    // user/assistant alternation; back-to-back tool-result user messages
    // (which our `tool` role becomes) get merged.
    const last = out.at(-1)
    if (last !== undefined && last.role === block.role) {
      last.content.push(...block.content)
    } else {
      out.push(block)
    }
    if (caching && msg.cache !== undefined) {
      // Mark the last content block of this message as a cache breakpoint.
      const target = out[out.length - 1].content.at(-1)
      if (target !== undefined && supportsCacheControl(target)) {
        target.cache_control = { type: "ephemeral" }
      }
    }
  }
  return out
}

function supportsCacheControl(
  block: AnthropicContentBlock
): block is
  | AnthropicDocumentBlock
  | AnthropicImageBlock
  | AnthropicTextBlock
  | AnthropicToolResultBlock {
  return (
    block.type === "text" ||
    block.type === "tool_result" ||
    block.type === "image" ||
    block.type === "document"
  )
}

/** Translate one `ImagePart` to Anthropic's `image` content block.
 *  Anthropic accepts both base64 (with `media_type`) and URL sources. */
function toAnthropicImageBlock(part: ImagePart): AnthropicImageBlock {
  if (part.source.type === "base64") {
    return {
      source: { data: part.source.data, media_type: part.mime, type: "base64" },
      type: "image",
    }
  }
  return { source: { type: "url", url: part.source.url }, type: "image" }
}

/** Map a tool result's `content` to the shape Anthropic's
 *  `tool_result.content` accepts: a string (passes through) or an
 *  array of text + image blocks. PDFs and audio/video aren't allowed
 *  inside tool_result on Anthropic's wire — degrade to text
 *  placeholders so the model still has *some* signal. */
function toAnthropicToolResultContent(
  content: string | (TextPart | Attachment)[]
): AnthropicToolResultBlock["content"] {
  if (typeof content === "string") return content
  const out: (AnthropicTextBlock | AnthropicImageBlock)[] = []
  for (const p of content) {
    if (p.type === "text") out.push({ text: p.text, type: "text" })
    else if (p.type === "image") out.push(toAnthropicImageBlock(p))
    else out.push({ text: `[${p.type} attachment omitted; not allowed in tool_result]`, type: "text" })
  }
  return out
}

/** Translate one `PdfPart` to Anthropic's `document` content block.
 *  Anthropic does both vision (renders pages) and text extraction in
 *  one call — no need to pre-extract on the consumer side. */
function toAnthropicDocumentBlock(part: PdfPart): AnthropicDocumentBlock {
  if (part.source.type === "base64") {
    return {
      source: { data: part.source.data, media_type: "application/pdf", type: "base64" },
      type: "document",
    }
  }
  return { source: { type: "url", url: part.source.url }, type: "document" }
}

function toAnthropicMessage(msg: Message<"user" | "assistant" | "tool">): AnthropicMessage {
  switch (msg.role) {
    case "user": {
      let content: AnthropicContentBlock[]
      if (typeof msg.content === "string") {
        content = [{ text: msg.content, type: "text" }]
      } else {
        content = []
        for (const p of msg.content) {
          if (p.type === "text") content.push({ text: p.text, type: "text" })
          else if (p.type === "image") content.push(toAnthropicImageBlock(p))
          else if (p.type === "pdf") content.push(toAnthropicDocumentBlock(p))
          else {
            // Audio and video aren't supported by Anthropic.
            throw new Error(
              `Anthropic does not accept ${p.type} attachments. ` +
                `Use a different provider (Gemini supports audio/video).`
            )
          }
        }
      }
      return { content, role: "user" }
    }
    case "assistant": {
      const content: AnthropicContentBlock[] = []
      if (typeof msg.content === "string") {
        content.push({ text: msg.content, type: "text" })
      } else {
        for (const part of msg.content) {
          if (part.type === "text") {
            content.push({ text: part.text, type: "text" })
          } else if (part.type === "reasoning") {
            // Anthropic round-trips thinking blocks during tool-use cycles.
            // `signature` is opaque and must be preserved verbatim.
            content.push({
              signature: part.signature,
              thinking: part.text,
              type: "thinking",
            })
          } else {
            content.push({
              id: part.id,
              input: part.params ?? {},
              name: part.name,
              type: "tool_use",
            })
          }
        }
      }
      return { content, role: "assistant" }
    }
    case "tool": {
      // One Anthropic tool_result block per ToolResultPart. Multiple
      // results from a single tool message all sit inside the same user
      // message; subsequent tool messages get coalesced upstream.
      // Rich content (text + images) maps to tool_result.content[]
      // blocks natively; PDFs aren't allowed inside tool_result so
      // degrade to a text placeholder.
      const content: AnthropicContentBlock[] = msg.content.map((part) => ({
        content: toAnthropicToolResultContent(part.content),
        is_error: part.isError === true ? true : undefined,
        tool_use_id: part.id,
        type: "tool_result",
      }))
      return { content, role: "user" }
    }
    default: {
      const _exhaustive: never = msg
      throw new Error(`Unhandled message role: ${(_exhaustive as { role: string }).role}`)
    }
  }
}

// ── SSE parsing ──────────────────────────────────────────────────────────

interface AnthropicMessageStart {
  type: "message_start"
  message: {
    id: string
    model: string
    usage: AnthropicUsage
  }
}

interface AnthropicUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

interface AnthropicContentBlockStart {
  type: "content_block_start"
  index: number
  content_block:
    | { type: "text"; text: string }
    | { type: "thinking"; thinking: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
}

interface AnthropicContentBlockDelta {
  type: "content_block_delta"
  index: number
  delta:
    | { type: "text_delta"; text: string }
    | { type: "thinking_delta"; thinking: string }
    | { type: "signature_delta"; signature: string }
    | { type: "input_json_delta"; partial_json: string }
}

interface AnthropicContentBlockStop {
  type: "content_block_stop"
  index: number
}

interface AnthropicMessageDelta {
  type: "message_delta"
  delta: { stop_reason: string | null; stop_sequence: string | null }
  usage: { output_tokens: number }
}

interface AnthropicMessageStop {
  type: "message_stop"
}

interface AnthropicErrorEvent {
  type: "error"
  error: { type: string; message: string }
}

type AnthropicEvent =
  | AnthropicMessageStart
  | AnthropicContentBlockStart
  | AnthropicContentBlockDelta
  | AnthropicContentBlockStop
  | AnthropicMessageDelta
  | AnthropicMessageStop
  | AnthropicErrorEvent
  | { type: "ping" }

interface PendingToolUse {
  id: string
  name: string
  argsBuffer: string
}

async function* parseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncIterable<StreamEvent> {
  const decoder = new TextDecoder()
  let buffer = ""
  const pendingToolUses = new Map<number, PendingToolUse>()
  let usage: TokenCount = { input: 0, output: 0 }
  let finishReason: FinishReason = "other"

  const reader = body.getReader()
  try {
    for (;;) {
      if (signal?.aborted) throw abortError()
      // oxlint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read()
      if (signal?.aborted) throw abortError()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf("\n\n")
      while (idx !== -1) {
        const raw = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const evt = parseSseEvent(raw)
        if (evt !== undefined) {
          for (const out of handleEvent(evt, pendingToolUses, usage)) {
            if (out.type === "finish") {
              finishReason = out.finishReason
              usage = out.usage
            } else {
              yield out
            }
          }
        }
        idx = buffer.indexOf("\n\n")
      }
    }
  } finally {
    reader.releaseLock()
  }
  yield { finishReason, type: "finish", usage }
}

function parseSseEvent(block: string): AnthropicEvent | undefined {
  const lines = block.split("\n")
  let data = ""
  for (const line of lines) {
    if (line.startsWith("data:")) data += line.slice(5).trimStart()
  }
  if (data === "") return undefined
  try {
    return JSON.parse(data) as AnthropicEvent
  } catch {
    return undefined
  }
}

function* handleEvent(
  evt: AnthropicEvent,
  pendingToolUses: Map<number, PendingToolUse>,
  usageSoFar: TokenCount
): Iterable<StreamEvent> {
  switch (evt.type) {
    case "message_start": {
      // Capture initial usage — input + cache fields land here. Output
      // ticks up via message_delta as tokens stream.
      const u = evt.message.usage
      // Mutate in place so the running tally is visible to later events
      // without a separate channel.
      usageSoFar.input = u.input_tokens
      usageSoFar.output = u.output_tokens
      if (u.cache_read_input_tokens !== undefined) {
        usageSoFar.cacheRead = u.cache_read_input_tokens
      }
      if (u.cache_creation_input_tokens !== undefined) {
        usageSoFar.cacheWrite = u.cache_creation_input_tokens
      }
      return
    }
    case "content_block_start": {
      const cb = evt.content_block
      if (cb.type === "tool_use") {
        pendingToolUses.set(evt.index, { argsBuffer: "", id: cb.id, name: cb.name })
      } else if (cb.type === "text" && cb.text !== "") {
        yield { delta: cb.text, type: "text-delta" }
      } else if (cb.type === "thinking" && cb.thinking !== "") {
        yield { delta: cb.thinking, type: "reasoning-delta" }
      }
      return
    }
    case "content_block_delta": {
      const d = evt.delta
      switch (d.type) {
        case "text_delta": {
          if (d.text !== "") yield { delta: d.text, type: "text-delta" }
          return
        }
        case "thinking_delta": {
          if (d.thinking !== "") yield { delta: d.thinking, type: "reasoning-delta" }
          return
        }
        case "signature_delta": {
          // Signature arrives at the end of a thinking block — emit it
          // as a zero-delta reasoning event so `collect` can attach it
          // to the open reasoning part.
          yield { delta: "", signature: d.signature, type: "reasoning-delta" }
          return
        }
        case "input_json_delta": {
          const pending = pendingToolUses.get(evt.index)
          if (pending !== undefined) pending.argsBuffer += d.partial_json
          return
        }
      }
      return
    }
    case "content_block_stop": {
      const pending = pendingToolUses.get(evt.index)
      if (pending !== undefined) {
        pendingToolUses.delete(evt.index)
        yield {
          id: pending.id,
          name: pending.name,
          params: safeParseJson(pending.argsBuffer),
          type: "tool-call",
        }
      }
      return
    }
    case "message_delta": {
      // Final usage roll-up — output_tokens is the authoritative total
      // for the turn (replaces the running value).
      usageSoFar.output = evt.usage.output_tokens
      yield {
        finishReason: mapStopReason(evt.delta.stop_reason),
        type: "finish",
        usage: { ...usageSoFar },
      }
      return
    }
    case "error": {
      throw new Error(`Anthropic stream error: ${evt.error.type}: ${evt.error.message}`)
    }
    case "message_stop":
    case "ping": {
      return
    }
  }
}

function mapStopReason(reason: string | null): FinishReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence": {
      return "stop"
    }
    case "max_tokens": {
      return "length"
    }
    case "tool_use": {
      return "tool-calls"
    }
    case "refusal": {
      return "content-filter"
    }
    default: {
      return "other"
    }
  }
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
    return s
  }
}
