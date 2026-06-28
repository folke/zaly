import type { Inlined } from "../content/part.ts"
import type {
  FinishReason,
  Provider,
  ProviderRequest,
  ReasoningOptions,
  StreamEvent,
  TokenCount,
  ToolChoice,
} from "../provider.ts"
import type { Content, ImagePart, Message, PdfPart, ProviderOptions, Tool } from "../types.ts"

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
import { ContentTransform } from "../content/transform.ts"

// ── Content transform ───────────────────────────────────────────────────
//
// Maps `Content` (the wide internal shape) to what Anthropic's wire
// API can actually consume. Composed via `.pipe(...)` against the
// step-function helpers so each step's narrowing flows into the next:
//
//   1. audio / video → `<audio>` / `<video>` MetaPart (Anthropic
//      doesn't accept those modalities; demote so the model still
//      sees a reference).
//   2. image / pdf file-source → base64 via `inlineFileSources`.
//      Anthropic's image and document blocks accept base64 or url;
//      file sources are eliminated here.
//   3. ErrorPart → `<error>` MetaPart. Placed after inlining so any
//      ErrorParts emitted by failed inlining steps are also captured.
//   4. MetaPart → `<tag>JSON</tag>` TextPart so the wire layer only
//      deals with text + image + pdf.
//   5. `sanitizeText` runs `cleanTextAgent` on every TextPart — strips
//      remaining ANSI / control bytes / adversarial Unicode that
//      survived upstream cleaning (e.g. read-tool content, fetch
//      bodies, anything that didn't go through `cleanTextTui`).
//
// `.pipe(stepFn)` carries the chain's narrowed `T` through each step
// — unlike `.extend(other)`, whose appended chain was built from a
// fresh `ContentTransform.create()` and can't see prior narrowing.
// `AnthropicPart` below infers to
// `TextPart | Inlined<ImagePart> | Inlined<PdfPart>` exactly.

const anthropicTransform = ContentTransform.create()
  .pipe(attachmentToMeta("audio", "video"))
  .pipe(inlineFileSources())
  .pipe(compressImages())
  .pipe(errorToMeta())
  .pipe(metaToText())
  .pipe(sanitizeText())
  .pipe(truncateText())

async function transformAnthropic(content: Content) {
  const parts = typeof content === "string" ? [{ text: content, type: "text" as const }] : content
  return anthropicTransform.run(parts)
}

/** Post-transform content shape Anthropic's wire layer consumes. The
 *  type is inferred from the chain — the wire layer below switches on
 *  the resulting `type` discriminator and TS verifies exhaustiveness. */
export type AnthropicContent = Awaited<ReturnType<typeof transformAnthropic>>

/**
 * Anthropic Messages API adapter.
 *
 * Translates the core `Message` / `Tool` types into the `/v1/messages`
 * request shape, streams responses via SSE, and emits normalised
 * `StreamEvent`s.
 *
 * Covered:
 *   - text / image / PDF content parts (incl. image-bearing tool results)
 *   - tool calls + tool results, streaming, usage/cost
 *   - prompt caching (`cache_control: { type: "ephemeral" }` — rolling
 *     marker on the trailing message + the trailing tool definition)
 *   - extended thinking via `reasoning.effort` / `reasoning.budget`
 *
 * Not implemented:
 *   - server-side tools (computer-use, web_search, …)
 *   - `response_format` (Anthropic has no JSON mode — use tools)
 */
export function createAnthropic(config: ProviderOptions = {}): Provider<"anthropic"> {
  const baseUrl = (config.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "")
  const doFetch = config.fetch ?? fetch

  return {
    id: "anthropic",
    async *stream(req: ProviderRequest): AsyncIterable<StreamEvent> {
      const body = await buildRequest(req)
      const apiKey = await resolveApiKey(config.apiKey)
      const auth = (): Record<string, string> => (apiKey?.key ? { "x-api-key": apiKey.key } : {})
      const response = await doFetch(`${baseUrl}/messages`, {
        body: safeStringify(body),
        headers: {
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
          ...auth(),
          ...apiKey?.headers,
          ...config.headers,
        },
        method: "POST",
        signal: req.opts.signal,
      })
      if (!response.ok || response.body === null) {
        const text = await response.text().catch(() => "")
        throw new Error(`Anthropic ${response.status}: ${text || response.statusText}`)
      }
      yield* parseStream(response.body, req.opts.signal)
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
  thinking?:
    | { type: "enabled"; budget_tokens: number }
    | { type: "adaptive" }
    | { type: "disabled" }
  output_config?: { effort: "low" | "medium" | "high" | "xhigh" | "max" }
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

async function buildRequest(req: ProviderRequest): Promise<AnthropicRequest> {
  const { ctx, model, opts } = req
  const caching = opts.caching ?? true
  // Anthropic requires max_tokens. Default to the catalog's output cap
  // when the caller didn't set one.
  const maxTokens = opts.maxTokens ?? model.maxTokens

  // The durable `prompt[]` is the only thing that lands in Anthropic's
  // top-level `system` slot. Mid-conversation `role: "system"` messages
  // (heartbeats, task completions, wakeups, ad-hoc injects) are
  // converted to user messages with their content wrapped in a
  // `<system>` MetaPart — Anthropic disallows mid-conversation system
  // role outright, and reframing them this way preserves the "system
  // note" signal while staying inside user/assistant alternation.
  const systemBlocks: AnthropicTextBlock[] = []
  if (ctx.prompt && ctx.prompt.length > 0) {
    systemBlocks.push(
      ...ctx.prompt.filter((text) => text !== "").map((text) => ({ text, type: "text" as const }))
    )
  }
  const conversational: Message[] = ctx.messages.map((msg) =>
    msg.role === "system" ? systemToUser(msg) : msg
  )

  const out: AnthropicRequest = {
    max_tokens: maxTokens,
    messages: await toAnthropicMessages(conversational, caching),
    model: model.model,
    stream: true,
  }

  if (systemBlocks.length > 0) {
    // String shorthand only when there's a single un-cached block.
    out.system =
      systemBlocks.length === 1 && systemBlocks[0].cache_control === undefined
        ? systemBlocks[0].text
        : systemBlocks
  }

  if (opts.temperature !== undefined) out.temperature = opts.temperature
  if (opts.stopSequences !== undefined) out.stop_sequences = opts.stopSequences

  if (ctx.tools !== undefined && ctx.tools.length > 0) {
    out.tools = ctx.tools.map((t) => toAnthropicTool(t))
    if (caching) {
      // Marker on the last tool covers all tools above it in the cache
      // prefix, per Anthropic's caching rules — caches the
      // `system + tools` segment across the whole session.
      out.tools[out.tools.length - 1].cache_control = { type: "ephemeral" }
    }
    if (opts.toolChoice !== undefined) out.tool_choice = toAnthropicToolChoice(opts.toolChoice)
  }

  applyThinking(out, model.model, opts.reasoning, maxTokens)

  return out
}

function toAnthropicTool(tool: Tool): AnthropicTool {
  return {
    description: tool.desc,
    input_schema: tool.params,
    name: tool.name,
  }
}

function toAnthropicToolChoice(
  choice: NonNullable<ToolChoice>
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
function applyThinking(
  out: AnthropicRequest,
  model: string,
  reasoning: ReasoningOptions | undefined,
  maxTokens: number
): void {
  if (reasoning?.effort === "off") {
    if (isMythos(model)) out.thinking = { type: "disabled" }
    return
  }
  if (supportsAdaptiveThinking(model)) {
    out.thinking = { type: "adaptive" }
    out.output_config = { effort: adaptiveEffort(model, reasoning?.effort) }
    return
  }
  const thinking = thinkingBudget(reasoning, maxTokens)
  if (thinking !== undefined) out.thinking = thinking
}

function thinkingBudget(
  reasoning: ReasoningOptions | undefined,
  maxTokens: number
): Extract<AnthropicRequest["thinking"], { type: "enabled" }> | undefined {
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
      case "max": {
        budget = maxTokens - 1
        break
      }
    }
  }
  // Anthropic requires budget < max_tokens; clamp with a small headroom
  // so the model can still produce a final answer.
  const clamped = Math.min(budget, Math.max(1024, maxTokens - 1))
  return { budget_tokens: clamped, type: "enabled" }
}

function supportsAdaptiveThinking(model: string): boolean {
  if (isMythos(model)) return true
  const parsed = parseClaudeVersion(model)
  return parsed !== undefined && parsed.major >= 4 && parsed.minor >= 6
}

function adaptiveEffort(
  model: string,
  effort: ReasoningOptions["effort"]
): NonNullable<AnthropicRequest["output_config"]>["effort"] {
  if (effort === "minimal" || effort === "low") return "low"
  if (effort === "medium") return "medium"
  if (effort === "xhigh") return supportsXHighEffort(model) ? "xhigh" : "high"
  if (effort === "max") return supportsMaxEffort(model) ? "max" : "high"
  return "high"
}

function supportsXHighEffort(model: string): boolean {
  const parsed = parseClaudeVersion(model)
  return (
    parsed?.family === "opus" && parsed.major === 4 && (parsed.minor === 7 || parsed.minor === 8)
  )
}

function supportsMaxEffort(model: string): boolean {
  if (isMythos(model)) return true
  const parsed = parseClaudeVersion(model)
  if (parsed?.major !== 4) return false
  if (parsed.family === "opus") return parsed.minor >= 6 && parsed.minor <= 8
  return parsed.family === "sonnet" && parsed.minor === 6
}

function isMythos(model: string): boolean {
  return model === "claude-mythos-preview"
}

function parseClaudeVersion(
  model: string
): { family: string; major: number; minor: number } | undefined {
  const match = /^claude-([a-z]+)-(\d+)-(\d+)(?:-|$)/.exec(model)
  if (!match) return undefined
  return { family: match[1], major: Number(match[2]), minor: Number(match[3]) }
}

async function toAnthropicMessages(
  messages: Message[],
  caching: boolean
): Promise<AnthropicMessage[]> {
  const out: AnthropicMessage[] = []
  for (const msg of messages) {
    if (msg.role === "system") {
      // Filtered upstream — keep the guard so future refactors fail fast.
      throw new Error("system messages must be hoisted to top-level system field")
    }
    // Sequential — coalescing logic below depends on `out.at(-1)` so
    // we can't parallelise per-message.
    // eslint-disable-next-line no-await-in-loop
    const block = await toAnthropicMessage(msg)
    // Coalesce consecutive same-role messages. Anthropic enforces strict
    // user/assistant alternation; back-to-back tool-result user messages
    // (which our `tool` role becomes) get merged.
    const last = out.at(-1)
    if (last !== undefined && last.role === block.role) {
      last.content.push(...block.content)
    } else {
      out.push(block)
    }
  }
  // Rolling cache breakpoint: mark the last content block of the
  // trailing message. This caches the `system + tools + messages-up-to-last`
  // prefix; every turn the marker rolls forward, so each request hits
  // the previous turn's cache.
  if (caching && out.length > 0) {
    const target = out[out.length - 1].content.at(-1)
    if (target !== undefined && supportsCacheControl(target)) {
      target.cache_control = { type: "ephemeral" }
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

/** Translate one (transformed, file-source-free) `ImagePart` to
 *  Anthropic's `image` content block. Accepts base64 (with
 *  `media_type`) and URL sources only — file sources were inlined by
 *  the transform chain. */
function toAnthropicImageBlock(part: Inlined<ImagePart>): AnthropicImageBlock {
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
 *  array of text + image blocks. PDFs aren't allowed inside
 *  tool_result on Anthropic's wire — degrade to a text placeholder
 *  so the model still has *some* signal. (The full transform chain
 *  has already eliminated audio/video/error/meta upstream.) */
async function toAnthropicToolResultContent(
  content: Content
): Promise<AnthropicToolResultBlock["content"]> {
  // Anthropic accepts a bare string for tool_result content too —
  // pass it through unchanged. Only structured arrays go through the
  // transform + wire-loop below.
  if (typeof content === "string") return content
  const transformed = await transformAnthropic(content)
  const out: (AnthropicTextBlock | AnthropicImageBlock)[] = []
  for (const p of transformed) {
    if (p.type === "text") {
      if (p.text !== "") out.push({ text: p.text, type: "text" })
    } else if (p.type === "image") out.push(toAnthropicImageBlock(p))
    else {
      // Exhaustive: `transformed` is `(TextPart | Inlined<ImagePart> |
      // Inlined<PdfPart>)[]`. Anything that isn't text or image is
      // pdf; tool_result on Anthropic doesn't allow pdf, so degrade
      // to a text placeholder.
      out.push({ text: "[pdf attachment omitted; not allowed in tool_result]", type: "text" })
    }
  }
  return out
}

/** Translate one (transformed, file-source-free) `PdfPart` to
 *  Anthropic's `document` content block. Anthropic does both vision
 *  (renders pages) and text extraction in one call — no need to
 *  pre-extract on the consumer side. */
function toAnthropicDocumentBlock(part: Inlined<PdfPart>): AnthropicDocumentBlock {
  if (part.source.type === "base64") {
    return {
      source: { data: part.source.data, media_type: "application/pdf", type: "base64" },
      type: "document",
    }
  }
  return { source: { type: "url", url: part.source.url }, type: "document" }
}

async function toAnthropicMessage(
  msg: Message<"user" | "assistant" | "tool">
): Promise<AnthropicMessage> {
  switch (msg.role) {
    case "user": {
      const content: AnthropicContentBlock[] = []
      const transformed = await transformAnthropic(msg.content)
      for (const p of transformed) {
        if (p.type === "text") {
          if (p.text !== "") content.push({ text: p.text, type: "text" })
        } else if (p.type === "image") content.push(toAnthropicImageBlock(p))
        else content.push(toAnthropicDocumentBlock(p))
        // Exhaustive: `transformed` is `(TextPart | Inlined<ImagePart>
        // | Inlined<PdfPart>)[]`. The else branch is the pdf variant.
      }
      return { content, role: "user" }
    }
    case "assistant": {
      const content: AnthropicContentBlock[] = []
      if (typeof msg.content === "string") {
        if (msg.content !== "") content.push({ text: msg.content, type: "text" })
      } else {
        for (const part of msg.content) {
          if (part.type === "text") {
            // Anthropic 400s on empty text blocks. They show up when the
            // assistant emits only tool calls / reasoning and the streamer
            // commits a zero-length text part.
            if (part.text !== "") content.push({ text: part.text, type: "text" })
          } else if (part.type === "reasoning") {
            // Anthropic round-trips thinking blocks during tool-use
            // cycles; `signature` is opaque and must be preserved
            // verbatim. Drop signature-less reasoning — Anthropic 400s
            // on it, and the Model layer's transform has already
            // ensured anything reaching here came from the same model.
            if (part.signature !== undefined) {
              content.push({
                signature: part.signature,
                thinking: part.text,
                type: "thinking",
              })
            }
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
      const content: AnthropicContentBlock[] = await Promise.all(
        msg.content.map(async (part) => ({
          content: await toAnthropicToolResultContent(part.content),
          is_error: part.isError === true ? true : undefined,
          tool_use_id: part.id,
          type: "tool_result" as const,
        }))
      )
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
      //
      // `usage.input` is the *uncached* portion (full-rate billing).
      // Cache reads / writes are reported separately as their own
      // billing tiers. Anthropic reports this shape natively; nothing
      // to translate.
      const u = evt.message.usage
      // Mutate in place so the running tally is visible to later events
      // without a separate channel.
      usageSoFar.input = u.input_tokens
      usageSoFar.output = u.output_tokens
      if (u.cache_read_input_tokens !== undefined) usageSoFar.cacheRead = u.cache_read_input_tokens
      if (u.cache_creation_input_tokens !== undefined)
        usageSoFar.cacheWrite = u.cache_creation_input_tokens
      return
    }
    case "content_block_start": {
      const cb = evt.content_block
      if (cb.type === "tool_use") {
        pendingToolUses.set(evt.index, { argsBuffer: "", id: cb.id, name: cb.name })
        yield {
          args: "",
          id: cb.id,
          key: String(evt.index),
          name: cb.name,
          type: "tool-call-delta",
        }
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
          if (pending !== undefined) {
            pending.argsBuffer += d.partial_json
            yield {
              args: pending.argsBuffer,
              delta: d.partial_json,
              id: pending.id,
              key: String(evt.index),
              name: pending.name,
              type: "tool-call-delta",
            }
          }
          return
        }
      }
    }
    case "content_block_stop": {
      const pending = pendingToolUses.get(evt.index)
      if (pending !== undefined) {
        pendingToolUses.delete(evt.index)
        yield {
          id: pending.id,
          name: pending.name,
          params: pending.argsBuffer,
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

/** Convert a mid-conversation `role: "system"` message into a user
 *  message whose content is wrapped in a `<system>` MetaPart.
 *
 *  The durable system prompt (`AgentOptions.prompt`) is the only thing
 *  that rides in the wire-level system slot. Mid-conversation system
 *  notes (heartbeats, task completions, wakeups, ad-hoc injects) are
 *  not durable context — they're events the model needs to react to in
 *  the conversation flow.
 *
 *  Anthropic refuses mid-conversation system messages outright; OpenAI
 *  accepts them but mixes them with the durable prompt in confusing
 *  ways for long conversations. Reframing them as user messages with a
 *  `<system>` MetaPart wrapper preserves the "this is a system note"
 *  signal while staying within the providers' user/assistant alternation
 *  model. */
export function systemToUser(msg: Message<"system">): Message<"user"> {
  return {
    content: [{ content: msg.content, tag: "system-reminder", type: "meta" }],
    role: "user",
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
