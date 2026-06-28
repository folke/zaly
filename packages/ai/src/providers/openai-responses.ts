import type { Inlined } from "../content/part.ts"
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
import type {
  Content,
  ImagePart,
  Message,
  PdfPart,
  ProviderOptions,
  Quirks,
  Tool,
} from "../types.ts"

import { safeStringify } from "@zaly/shared"
import { resolveApiKey } from "../auth/manager.ts"
import {
  attachmentToMeta,
  compressImages,
  errorToMeta,
  inlineFileSources,
  metaToText,
  sanitizeText,
  truncateText,
} from "../content/compose.ts"
import { stringifyContent } from "../content/format.ts"
import { ContentTransform } from "../content/transform.ts"

// ── Content transform ───────────────────────────────────────────────────
//
// Maps `Content` to what OpenAI Responses can consume.
//
//   1. audio / video → MetaPart (Responses doesn't take either as input).
//   2. image / pdf file-source → base64 via `inlineFileSources`.
//      Responses takes images as `input_image` (url or base64 data URL)
//      and PDFs natively as `input_file`.
//   3. ErrorPart → `<error>` MetaPart.
//   4. MetaPart → `<tag>JSON</tag>` TextPart.
//
// `OpenAIResponsesContent` infers to `TextPart | Inlined<ImagePart> | Inlined<PdfPart>`.

const responsesTransform = ContentTransform.create()
  .pipe(attachmentToMeta("audio", "video"))
  .pipe(inlineFileSources())
  .pipe(compressImages())
  .pipe(errorToMeta())
  .pipe(metaToText())
  .pipe(sanitizeText())
  .pipe(truncateText())

async function transformResponses(content: Content) {
  const parts = typeof content === "string" ? [{ text: content, type: "text" as const }] : content
  return responsesTransform.run(parts)
}

export type OpenAIResponsesContent = Awaited<ReturnType<typeof transformResponses>>

/**
 * OpenAI Responses API adapter.
 *
 * Translates the core `Message` / `Tool` types into the `/responses`
 * request shape, streams via SSE, and emits normalised `StreamEvent`s.
 *
 * The codex (ChatGPT-backed) backend rides this same adapter — its
 * deviations from the public Responses API are routed through `Quirks`:
 * `responsesStore`, `responsesInclude`, `responsesSystemAs`,
 * `responsesReasoningSummary`, `friendlyErrors`. baseUrl + auth headers
 * for codex come from the model entry (`overrides.ts` overlay) and the
 * `codexAuth` provider, respectively.
 */
export function createOpenAIResponses(config: ProviderOptions = {}): Provider<"openai-responses"> {
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")
  const doFetch = config.fetch ?? fetch

  return {
    id: "openai-responses",
    async *stream(req: ProviderRequest): AsyncIterable<StreamEvent> {
      const body = await buildRequest(req)
      const apiKey = await resolveApiKey(config.apiKey)
      const auth = (): Record<string, string> =>
        apiKey?.key ? { Authorization: `Bearer ${apiKey.key}` } : {}
      const response = await doFetch(`${baseUrl}/responses`, {
        body: safeStringify(body),
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
          ...auth(),
          ...apiKey?.headers,
          ...config.headers,
        },
        method: "POST",
        signal: req.opts.signal,
      })
      if (!response.ok || response.body === null) {
        throw await formatError(response, req.model.quirks?.friendlyErrors)
      }
      yield* parseStream(response.body, req.opts.signal)
    },
  }
}

// ── Request translation ──────────────────────────────────────────────────

interface ResponsesRequest {
  model: string
  input: ResponsesInputItem[]
  instructions?: string
  tools?: ResponsesTool[]
  tool_choice?: "auto" | "required" | "none" | { type: "function"; name: string }
  temperature?: number
  max_output_tokens?: number
  reasoning?: { effort?: "minimal" | "low" | "medium" | "high"; summary?: string }
  text?: {
    format?: ResponsesTextFormat
    verbosity?: "low" | "medium" | "high"
  }
  include?: string[]
  store?: boolean
  stream: true
}

type ResponsesTextFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; name: string; schema: unknown; strict?: boolean }

interface ResponsesTool {
  type: "function"
  name: string
  description?: string
  parameters: unknown
  strict?: boolean
}

type ResponsesInputItem =
  | ResponsesMessageItem
  | ResponsesFunctionCallItem
  | ResponsesFunctionCallOutputItem
  | ResponsesReasoningItem

interface ResponsesMessageItem {
  type: "message"
  role: "system" | "developer" | "user" | "assistant"
  content: ResponsesContentBlock[]
}

interface ResponsesFunctionCallItem {
  type: "function_call"
  call_id: string
  name: string
  arguments: string
}

interface ResponsesFunctionCallOutputItem {
  type: "function_call_output"
  call_id: string
  output: string
}

interface ResponsesReasoningItem {
  type: "reasoning"
  id?: string
  encrypted_content?: string
  summary: { type: "summary_text"; text: string }[]
}

type ResponsesContentBlock =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" }
  | {
      type: "input_file"
      file_data?: string
      file_url?: string
      file_id?: string
      filename?: string
    }
  | { type: "output_text"; text: string }

async function buildRequest(req: ProviderRequest): Promise<ResponsesRequest> {
  const { ctx, model, opts } = req
  const quirks = model.quirks ?? {}

  const input: ResponsesInputItem[] = []
  // Sequential — one source message can fan out to multiple input items
  // (assistant messages with tool_use produce both reasoning + message
  // + function_call items; tool messages expand to one
  // function_call_output per result).
  for (const msg of ctx.messages) {
    // eslint-disable-next-line no-await-in-loop
    input.push(...(await toResponsesInputItems(msg)))
  }

  const out: ResponsesRequest = {
    input,
    model: model.modelId,
    stream: true,
  }

  // System prompt routing — `"instructions"` for codex (which rejects
  // system messages in `input`); `"input"` (default) for the public
  // Responses API.
  if (ctx.prompt && ctx.prompt.length > 0) {
    const promptText = ctx.prompt.join("\n\n")
    if ((quirks.responsesSystemAs ?? "input") === "instructions") {
      out.instructions = promptText
    } else {
      input.unshift({
        content: [{ text: promptText, type: "input_text" }],
        role: "system",
        type: "message",
      })
    }
  }

  if (opts.temperature !== undefined && quirks.temperatureSupported !== false) {
    out.temperature = opts.temperature
  }
  if (opts.maxTokens !== undefined) {
    const field = quirks.maxTokensField ?? "max_output_tokens"
    // Responses uses `max_output_tokens`; codex backend rejects any
    // max-tokens field, so the override sets `"none"` to suppress.
    // The other chat-completions values (`max_tokens` /
    // `max_completion_tokens`) belong to the openai adapter.
    if (field === "max_output_tokens") out.max_output_tokens = opts.maxTokens
  }

  if (ctx.tools !== undefined && ctx.tools.length > 0) {
    const strict = (opts.strictTools ?? quirks.strictTools) === true
    out.tools = ctx.tools.map((t) => toResponsesTool(t, strict))
    if (opts.toolChoice !== undefined) out.tool_choice = toResponsesToolChoice(opts.toolChoice)
  }

  const reasoning = buildReasoning(opts.reasoning?.effort, quirks)
  if (reasoning !== undefined) out.reasoning = reasoning

  if (opts.responseFormat !== undefined) {
    out.text = { format: toResponsesTextFormat(opts.responseFormat) }
  }

  if (quirks.responsesStore !== undefined) out.store = quirks.responsesStore
  if (quirks.responsesInclude !== undefined) out.include = quirks.responsesInclude

  return out
}

function buildReasoning(
  effort: ReasoningOptions["effort"],
  quirks: Quirks
): ResponsesRequest["reasoning"] {
  const clamped = clampEffort(effort, quirks.reasoningLevels)
  const summary = quirks.responsesReasoningSummary ?? "auto"

  if (clamped === "off" || clamped === undefined) {
    // No reasoning configured — omit the field entirely. Models that
    // always reason (gpt-5-codex etc.) ignore omission and reason at
    // the model default.
    return undefined
  }
  // `xhigh` / `max` collapse to `"high"` — the public Responses API tops
  // out there. Codex backend supports `xhigh` via per-model clamping
  // applied through `reasoningLevels`, which is handled above.
  const native = clamped === "xhigh" || clamped === "max" ? "high" : clamped
  const out: NonNullable<ResponsesRequest["reasoning"]> = { effort: native }
  if (summary !== "off") out.summary = summary
  return out
}

function clampEffort(
  effort: ReasoningOptions["effort"],
  levels: Quirks["reasoningLevels"]
): ReasoningOptions["effort"] | undefined {
  if (effort === undefined) return undefined
  if (levels === undefined) return effort
  if (levels.includes(effort)) return effort
  if (effort === "off") return levels.find((l) => l !== "off")
  const ordered: Exclude<NonNullable<typeof effort>, "off">[] = [
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]
  const idx = ordered.indexOf(effort)
  for (let i = idx; i >= 0; i--) {
    if (levels.includes(ordered[i])) return ordered[i]
  }
  return levels.find((l) => l !== "off") ?? effort
}

function toResponsesTool(tool: Tool, strict: boolean): ResponsesTool {
  return {
    description: tool.desc,
    name: tool.name,
    parameters: tool.params,
    strict,
    type: "function",
  }
}

function toResponsesToolChoice(
  choice: NonNullable<ToolChoice>
): NonNullable<ResponsesRequest["tool_choice"]> {
  if (typeof choice === "string") return choice
  return { name: choice.name, type: "function" }
}

function toResponsesTextFormat(format: ResponseFormat): ResponsesTextFormat {
  if (format.type === "json") return { type: "json_object" }
  return {
    name: format.name,
    schema: format.schema,
    strict: format.strict,
    type: "json_schema",
  }
}

function toResponsesImageBlock(part: Inlined<ImagePart>): ResponsesContentBlock {
  const url =
    part.source.type === "url" ? part.source.url : `data:${part.mime};base64,${part.source.data}`
  return {
    image_url: url,
    type: "input_image",
    ...(part.detail ? { detail: part.detail } : {}),
  }
}

function toResponsesPdfBlock(part: Inlined<PdfPart>): ResponsesContentBlock {
  if (part.source.type === "url") {
    return { file_url: part.source.url, type: "input_file" }
  }
  return {
    file_data: `data:${part.mime};base64,${part.source.data}`,
    filename: "document.pdf",
    type: "input_file",
  }
}

async function toUserContent(content: Content): Promise<ResponsesContentBlock[]> {
  const transformed = await transformResponses(content)
  const parts: ResponsesContentBlock[] = []
  for (const p of transformed) {
    if (p.type === "text") {
      if (p.text !== "") parts.push({ text: p.text, type: "input_text" })
    } else if (p.type === "image") parts.push(toResponsesImageBlock(p))
    else parts.push(toResponsesPdfBlock(p))
  }
  return parts
}

async function toResponsesInputItems(msg: Message): Promise<ResponsesInputItem[]> {
  switch (msg.role) {
    case "system": {
      // Mid-conversation system message — Responses accepts `developer`
      // for these; the durable prompt rides separately via
      // `instructions` or the leading system message in `input`.
      return [
        {
          content: [{ text: stringifyContent(msg.content), type: "input_text" }],
          role: "developer",
          type: "message",
        },
      ]
    }
    case "user": {
      return [{ content: await toUserContent(msg.content), role: "user", type: "message" }]
    }
    case "assistant": {
      return await toAssistantItems(msg)
    }
    case "tool": {
      // One function_call_output per result. Output is the stringified
      // content; the Responses API doesn't accept image/file blocks in
      // tool outputs, so non-text content collapses to a placeholder
      // marker (matching how chat-completions tool results behave).
      const out: ResponsesInputItem[] = []
      for (const part of msg.content) {
        // eslint-disable-next-line no-await-in-loop
        const text = await toolResultText(part.content)
        out.push({
          call_id: part.id,
          output: part.isError === true ? `ERROR: ${text}` : text,
          type: "function_call_output",
        })
      }
      return out
    }
    default: {
      const _exhaustive: never = msg
      throw new Error(`Unhandled message role: ${(_exhaustive as { role: string }).role}`)
    }
  }
}

async function toolResultText(content: Content): Promise<string> {
  if (typeof content === "string") return content
  const transformed = await transformResponses(content)
  const chunks: string[] = []
  let attachmentSeen = false
  for (const p of transformed) {
    if (p.type === "text") chunks.push(p.text)
    else attachmentSeen = true
  }
  const body = chunks.join("\n")
  return attachmentSeen ? `${body}\n[attachments omitted; tool outputs are text-only]` : body
}

async function toAssistantItems(msg: Message<"assistant">): Promise<ResponsesInputItem[]> {
  const out: ResponsesInputItem[] = []

  if (typeof msg.content === "string") {
    if (msg.content !== "") {
      out.push({
        content: [{ text: msg.content, type: "output_text" }],
        role: "assistant",
        type: "message",
      })
    }
    return out
  }

  // Round-trip preserves emission order so the model sees a coherent
  // turn: reasoning → text → tool calls. Each tool-call lands as its
  // own `function_call` item; consecutive text parts coalesce into one
  // `message` item with multiple `output_text` blocks.
  let pendingText: ResponsesContentBlock[] | undefined
  const flushText = (): void => {
    if (pendingText !== undefined && pendingText.length > 0) {
      out.push({ content: pendingText, role: "assistant", type: "message" })
    }
    pendingText = undefined
  }

  for (const part of msg.content) {
    if (part.type === "reasoning") {
      flushText()
      // `signature` carries `encrypted_content` for codex round-trip.
      // Drop the item when no encrypted content is available — sending
      // a reasoning item with only summary text isn't valid input, and
      // plaintext reasoning is provider-internal. Cross-provider
      // foreign blobs are already filtered out at the Model layer
      // (transform drops reasoning whose modelId doesn't match).
      if (part.signature !== undefined && part.signature !== "") {
        // `summary` is required on input reasoning items (empty array
        // is fine when no summary text was streamed).
        const summary: { type: "summary_text"; text: string }[] =
          part.text !== "" ? [{ text: part.text, type: "summary_text" }] : []
        out.push({
          encrypted_content: part.signature,
          summary,
          type: "reasoning",
        })
      }
    } else if (part.type === "text") {
      if (part.text !== "") {
        pendingText ??= []
        pendingText.push({ text: part.text, type: "output_text" })
      }
    } else {
      // tool-call
      flushText()
      const args = part.params ?? {}
      const argStr = typeof args === "string" ? args : safeStringify(args)
      out.push({
        arguments: argStr,
        call_id: part.id,
        name: part.name,
        type: "function_call",
      })
    }
  }
  flushText()
  return out
}

// ── SSE parsing ──────────────────────────────────────────────────────────

interface PendingFunctionCall {
  call_id: string
  name: string
  argsBuffer: string
}

async function* parseStream(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncIterable<StreamEvent> {
  const decoder = new TextDecoder()
  let buffer = ""
  // Function-call argument deltas arrive keyed by `item_id`. We buffer
  // until the matching `function_call_arguments.done` (or
  // `output_item.done`) and flush as one `tool-call`.
  const pendingCalls = new Map<string, PendingFunctionCall>()
  let usage: TokenCount = { input: 0, output: 0 }
  let finishReason: FinishReason = "other"
  let finished = false
  // Track whether the open output item is reasoning summary text vs
  // actual reasoning text — both stream as separate event families
  // and we forward both as `reasoning-delta`s.

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
          for (const out of handleEvent(evt, pendingCalls)) {
            if (out.type === "finish") {
              finishReason = out.finishReason
              usage = out.usage
              finished = true
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

  // Flush any function calls that never saw a matching `.done` (rare —
  // the API normally closes them before `response.completed`).
  for (const [, pending] of pendingCalls) {
    yield {
      id: pending.call_id,
      name: pending.name,
      params: pending.argsBuffer,
      type: "tool-call",
    }
  }
  if (!finished) finishReason = "other"
  yield { finishReason, type: "finish", usage }
}

interface ResponsesEvent {
  type: string
  [k: string]: unknown
}

function parseSseEvent(block: string): ResponsesEvent | undefined {
  // SSE format: each block is one event with optional `event:` and one
  // or more `data:` lines. Responses sends both `event:` (the type)
  // and a `data:` JSON payload; the JSON itself includes `type`, so
  // we read that and ignore the SSE event header.
  const lines = block.split("\n")
  let data = ""
  for (const line of lines) {
    if (line.startsWith("data:")) data += line.slice(5).trimStart()
  }
  if (data === "" || data === "[DONE]") return undefined
  try {
    return JSON.parse(data) as ResponsesEvent
  } catch {
    return undefined
  }
}

function* handleEvent(
  evt: ResponsesEvent,
  pendingCalls: Map<string, PendingFunctionCall>
): Iterable<StreamEvent> {
  // Codex normalises a few terminal events (`response.done`,
  // `response.incomplete`) onto `response.completed` upstream; the
  // public Responses API only emits `response.completed`. We treat
  // all three identically here.
  switch (evt.type) {
    case "response.output_text.delta": {
      const delta = typeof evt.delta === "string" ? evt.delta : ""
      if (delta !== "") yield { delta, type: "text-delta" }
      return
    }
    case "response.reasoning_summary_text.delta":
    case "response.reasoning_text.delta": {
      const delta = typeof evt.delta === "string" ? evt.delta : ""
      if (delta !== "") yield { delta, type: "reasoning-delta" }
      return
    }
    case "response.output_item.added": {
      const item = evt.item as { type?: string; id?: string; call_id?: string; name?: string }
      if (item.type === "function_call" && typeof item.id === "string") {
        const pending = {
          argsBuffer: "",
          call_id: typeof item.call_id === "string" ? item.call_id : item.id,
          name: typeof item.name === "string" ? item.name : "",
        }
        pendingCalls.set(item.id, pending)
        yield {
          args: "",
          id: pending.call_id,
          key: item.id,
          type: "tool-call-delta",
          ...(pending.name !== "" ? { name: pending.name } : {}),
        }
      }
      return
    }
    case "response.function_call_arguments.delta": {
      const itemId = typeof evt.item_id === "string" ? evt.item_id : ""
      const delta = typeof evt.delta === "string" ? evt.delta : ""
      const pending = pendingCalls.get(itemId)
      if (pending !== undefined && delta !== "") {
        pending.argsBuffer += delta
        yield {
          args: pending.argsBuffer,
          delta,
          id: pending.call_id,
          key: itemId,
          type: "tool-call-delta",
          ...(pending.name !== "" ? { name: pending.name } : {}),
        }
      }
      return
    }
    case "response.function_call_arguments.done": {
      const itemId = typeof evt.item_id === "string" ? evt.item_id : ""
      const pending = pendingCalls.get(itemId)
      if (pending !== undefined) {
        // Prefer the final `arguments` string from the event over the
        // accumulated delta buffer when present — the API guarantees
        // it's the canonical version.
        const final = typeof evt.arguments === "string" ? evt.arguments : pending.argsBuffer
        pendingCalls.delete(itemId)
        yield {
          id: pending.call_id,
          name: pending.name,
          params: final,
          type: "tool-call",
        }
      }
      return
    }
    case "response.output_item.done": {
      // Reasoning item closing — emit its `signature` (encrypted_content)
      // via a zero-delta reasoning event so collect() attaches it to
      // the open reasoning part.
      const item = evt.item as { type?: string; encrypted_content?: string } | undefined
      if (item?.type === "reasoning" && typeof item.encrypted_content === "string") {
        yield { delta: "", signature: item.encrypted_content, type: "reasoning-delta" }
      }
      return
    }
    case "response.completed":
    case "response.done":
    case "response.incomplete": {
      const response = (evt.response ?? {}) as {
        usage?: ResponsesUsage
        status?: string
        incomplete_details?: { reason?: string }
      }
      yield {
        finishReason: mapStatus(response.status, response.incomplete_details?.reason, pendingCalls),
        type: "finish",
        usage: usageFromResponse(response.usage),
      }
      return
    }
    case "response.failed": {
      const response = evt.response as { error?: { message?: string; code?: string } } | undefined
      const msg = response?.error?.message ?? response?.error?.code ?? "Responses API failed"
      throw new Error(msg)
    }
    case "error": {
      // SSE `error` events come in a few shapes across providers — top-level
      // `message`/`code`, a nested `error: { message, code }`, or a free-form
      // payload. Try each and fall back to a JSON dump so the actual cause
      // isn't swallowed.
      const e = evt as {
        message?: unknown
        code?: unknown
        error?: { message?: unknown; code?: unknown; type?: unknown }
      }
      const message =
        pickStr(e.message) ??
        pickStr(e.error?.message) ??
        pickStr(e.code) ??
        pickStr(e.error?.code) ??
        pickStr(e.error?.type)
      if (message !== undefined) throw new Error(`Responses stream error: ${message}`)
      throw new Error(`Responses stream error: ${JSON.stringify(evt)}`)
    }
    default: {
      return
    }
  }
}

interface ResponsesUsage {
  input_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
  output_tokens?: number
  output_tokens_details?: { reasoning_tokens?: number }
  total_tokens?: number
}

function usageFromResponse(usage: ResponsesUsage | undefined): TokenCount {
  if (usage === undefined) return { input: 0, output: 0 }
  const promptTokens = usage.input_tokens ?? 0
  const cached = usage.input_tokens_details?.cached_tokens
  const reasoning = usage.output_tokens_details?.reasoning_tokens
  return {
    input: cached !== undefined ? Math.max(0, promptTokens - cached) : promptTokens,
    output: usage.output_tokens ?? 0,
    ...(cached !== undefined ? { cacheRead: cached } : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
  }
}

function mapStatus(
  status: string | undefined,
  incompleteReason: string | undefined,
  pendingCalls: Map<string, PendingFunctionCall>
): FinishReason {
  if (status === "incomplete") {
    if (incompleteReason === "max_output_tokens") return "length"
    if (incompleteReason === "content_filter") return "content-filter"
    return "other"
  }
  if (status === "failed" || status === "cancelled") return "error"
  // `completed` — pick `tool-calls` if any function_call landed this
  // turn; otherwise plain `stop`.
  if (pendingCalls.size > 0) return "tool-calls"
  return "stop"
}

// ── Errors ───────────────────────────────────────────────────────────────

async function formatError(response: Response, friendly: Quirks["friendlyErrors"]): Promise<Error> {
  const text = await response.text().catch(() => "")
  const generic = `OpenAI Responses ${response.status}: ${text || response.statusText}`
  if (friendly !== "codex") return new Error(generic)

  // ChatGPT-backed codex backend returns structured error envelopes
  // with usage-limit specifics worth surfacing. Falls back to the
  // generic message when parsing fails.
  try {
    const parsed = JSON.parse(text) as {
      error?: {
        code?: string
        type?: string
        message?: string
        plan_type?: string
        resets_at?: number
      }
    }
    const err = parsed.error
    if (err !== undefined) {
      const code = err.code ?? err.type ?? ""
      if (
        /usage_limit_reached|usage_not_included|rate_limit_exceeded/i.test(code) ||
        response.status === 429
      ) {
        const plan = err.plan_type !== undefined ? ` (${err.plan_type.toLowerCase()} plan)` : ""
        const mins =
          err.resets_at !== undefined
            ? Math.max(0, Math.round((err.resets_at * 1000 - Date.now()) / 60_000))
            : undefined
        const when = mins !== undefined ? ` Try again in ~${mins} min.` : ""
        return new Error(`ChatGPT usage limit reached${plan}.${when}`.trim())
      }
      if (err.message !== undefined && err.message !== "") return new Error(err.message)
    }
  } catch {
    // fall through to generic
  }
  return new Error(generic)
}

function pickStr(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined
}

function abortError(): Error {
  const e = new Error("aborted")
  e.name = "AbortError"
  return e
}
