import type {
  Message,
  Quirks,
  ReasoningPart,
  RequestProviderOptions,
  TextPart,
  Tool,
  ToolCallPart,
} from "./types.ts"

/**
 * Contract every provider adapter implements. Intentionally single-
 * method: `stream` is the one primitive, `complete` is a helper that
 * drains it. Keeping the surface to one async-iterable means providers
 * implement one thing, and the harness layers (retries, throttling,
 * telemetry) wrap one thing.
 *
 * `countTokens` is optional — providers without native token counting
 * can fall back to a shared heuristic in the registry.
 */
export interface Provider<T extends string = string> {
  id: T
  stream(req: GenerateRequest): AsyncIterable<StreamEvent>
  countTokens?(req: CountRequest): Promise<TokenCount>
}

/**
 * Input to `stream` / `complete`. `model` is a `provider/id` URI — the
 * registry splits on the first `/` and passes the remainder through to
 * the adapter in `model` unchanged (adapters never see their own prefix).
 *
 * Field layering:
 *   - Top-level fields are user-facing request config — the kind of
 *     knob a user would set via a slash command (`/effort`,
 *     `/temperature`, `/tool-choice`). Provider-agnostic;
 *     adapters translate to each provider's native wire shape.
 *   - `providerOptions` is the escape hatch for power-user flags that
 *     only make sense on one provider.
 *   - Per-message `cache` + `providerOptions` are hints placed by the
 *     harness (cache cut-points, Anthropic thinking passthroughs).
 */
export interface GenerateRequest {
  model: string
  messages: Message[]
  tools?: Tool[]

  // ── User-facing request config ────────────────────────────────────
  temperature?: number
  maxTokens?: number
  stopSequences?: string[]
  toolChoice?: ToolChoice
  reasoning?: ReasoningOptions
  responseFormat?: ResponseFormat
  /** Grammar-enforce tool argument schemas where the provider supports
   *  it (OpenAI `strict: true`). Default off: MCP-supplied schemas
   *  often use features strict mode rejects, and our validation
   *  feedback loop recovers from wrong-shape args anyway. */
  strictTools?: boolean

  // ── Control ───────────────────────────────────────────────────────
  signal?: AbortSignal

  // ── Adapter dispatch (populated by `loadModel` from the model's
  //    catalog quirks; callers normally don't set this directly) ────
  quirks?: Quirks

  // ── Power-user escape hatch ───────────────────────────────────────
  providerOptions?: RequestProviderOptions
}

/** Tool-use control. `{ name }` forces the named tool; `"required"`
 *  forces the model to call any tool; `"none"` disables tool calls
 *  for this turn; `"auto"` (default) lets the model decide. */
export type ToolChoice = "auto" | "required" | "none" | { name: string }

/** Reasoning / thinking configuration.
 *
 *  `effort` is the user-facing knob. Adapters translate to each
 *  provider's native shape (`reasoning_effort` on OpenAI,
 *  `thinking.budget_tokens` on Anthropic, `thinkingConfig` on Google).
 *
 *  Levels, loosely ordered by cost:
 *    - `"off"`      — explicitly disable (no-op on models that always reason).
 *    - `"minimal"`  — lightest setting the provider offers.
 *    - `"low"` / `"medium"` / `"high"` — standard spread.
 *    - `"xhigh"`    — beyond OpenAI's `"high"` ceiling where the provider
 *                     allows it (Anthropic, Google); falls back to `"high"`
 *                     on providers capped there.
 *
 *  `budget` overrides the effort-derived budget with an explicit token
 *  count — power-user path for providers that accept a number
 *  (Anthropic `thinking.budget_tokens`, Google `thinkingBudget`). */
export interface ReasoningOptions {
  effort?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh"
  budget?: number
}

/** Structured-output format.
 *
 *  - `"json"` — any valid JSON.
 *  - `"json_schema"` — grammar-enforced against the supplied schema
 *    where the provider supports it. */
export type ResponseFormat =
  | { type: "json" }
  | { type: "json_schema"; name: string; schema: unknown; strict?: boolean }

/** Input to `countTokens`. Mirrors `GenerateRequest` but drops the
 *  execution knobs — token count depends on what's serialised, not on
 *  temperature or stop sequences. */
export interface CountRequest {
  model: string
  messages: Message[]
  tools?: Tool[]
}

/**
 * Events emitted while streaming a single assistant turn. The shape
 * is Vercel-AI-SDK-ish: typed union, each event self-describes.
 *
 * Text and reasoning stream as `-delta` events for incremental render;
 * tool calls are emitted whole — adapters buffer provider-side deltas
 * (OpenAI streams JSON-string fragments of `function.arguments`) and
 * emit one `tool-call` when the block is complete. Consumers that want
 * "typing" UI for tool args are rare and expensive to support safely,
 * so v0 normalises on complete.
 *
 * `finish` arrives once per stream. `error` is terminal — after it,
 * the iterator ends.
 */
export type StreamEvent =
  | { type: "text-delta"; delta: string }
  | { type: "reasoning-delta"; delta: string; signature?: string }
  | { type: "tool-call"; id: string; name: string; args: unknown }
  | { type: "finish"; finishReason: FinishReason; usage: TokenCount }
  | { type: "error"; error: Error }

/** Why the provider stopped generating. Normalised across providers —
 *  each adapter maps its native stop reasons onto this set. */
export type FinishReason =
  | "stop" // natural end-of-turn
  | "length" // hit maxTokens or context limit
  | "tool-calls" // stopped to hand control back for tool dispatch
  | "content-filter" // provider refused
  | "error"
  | "other"

/** Token accounting returned at end-of-stream and from `countTokens`.
 *  `cachedInput` is the portion of the input that was a cache hit
 *  (Anthropic `cache_read_input_tokens`, OpenAI
 *  `prompt_tokens_details.cached_tokens`). */
export interface TokenCount {
  input: number
  output: number
  cachedInput?: number
  reasoning?: number
}

/** Optional side-channels for `collect`. Both sync and async callbacks
 *  work — return a Promise to have `collect` wait for it before
 *  resolving; return nothing for fire-and-forget. Neither callback is
 *  awaited inside the stream loop, so slow handlers never create
 *  backpressure on the provider. */
export interface CollectOptions {
  /** Called after each event is processed, with the assistant message
   *  assembled so far. Receives a fresh snapshot on each call so
   *  consumers can safely retain / diff the value. */
  onUpdate?: (message: Extract<Message, { role: "assistant" }>) => void | Promise<unknown>
  /** Called with each raw `StreamEvent` — useful for side channels
   *  that don't map onto the assembled message (per-delta TTS,
   *  streaming telemetry, partial token usage). */
  onEvent?: (event: StreamEvent) => void | Promise<unknown>
}

/**
 * Drain a stream into a single assistant `Message`. Useful when the
 * caller doesn't care about incremental render — e.g., inside skill
 * runners, evals, or simple request/response tools.
 *
 * Returns the assembled message plus the final `finish` metadata so
 * callers can read `finishReason` and `usage` without a second pass
 * over the stream.
 *
 * Any async `onUpdate` / `onEvent` returns are tracked and awaited
 * before `collect` resolves — guarantees the final result is only
 * returned once all mirrored writes have settled. On the error path
 * (including abort), pending callbacks are still drained but their
 * rejections are suppressed so the primary error isn't masked.
 */
export async function collect(
  stream: AsyncIterable<StreamEvent>,
  opts?: CollectOptions
): Promise<{
  message: Extract<Message, { role: "assistant" }>
  finishReason: FinishReason
  usage: TokenCount
}> {
  const parts: (TextPart | ReasoningPart | ToolCallPart)[] = []
  let finishReason: FinishReason = "other"
  let usage: TokenCount = { input: 0, output: 0 }

  // Text and reasoning deltas coalesce into a single part each, in
  // emission order — if the provider interleaves (text → tool → text),
  // we start a new part on each transition.
  let openText: TextPart | ReasoningPart | undefined
  const pending: Promise<unknown>[] = []
  const track = (r?: unknown): void => {
    if (r instanceof Promise) pending.push(r)
  }
  const snapshot = (): Extract<Message, { role: "assistant" }> => ({
    // Fresh wrapper per call so consumers can retain the value; the
    // inner `parts` array is reused, which is fine because snapshots
    // are read-only from the consumer's point of view and any
    // structural-compare walks it immediately.
    content: parts.length === 0 ? "" : parts,
    role: "assistant",
  })

  let errored = false
  try {
    for await (const ev of stream) {
      switch (ev.type) {
        case "text-delta": {
          if (openText?.type === "text") openText.text += ev.delta
          else {
            openText = { text: ev.delta, type: "text" }
            parts.push(openText)
          }
          break
        }
        case "reasoning-delta": {
          if (openText?.type === "reasoning") {
            openText.text += ev.delta
            if (ev.signature !== undefined) openText.signature = ev.signature
          } else {
            openText = { signature: ev.signature, text: ev.delta, type: "reasoning" }
            parts.push(openText)
          }
          break
        }
        case "tool-call": {
          openText = undefined
          parts.push({ args: ev.args, id: ev.id, name: ev.name, type: "tool-call" })
          break
        }
        case "finish": {
          finishReason = ev.finishReason
          usage = ev.usage
          break
        }
        case "error": {
          throw ev.error
        }
      }
      track(opts?.onEvent?.(ev))
      // Only the delta/tool-call events mutate the assembled message;
      // skip onUpdate for metadata-only events (`finish`) to avoid
      // redundant snapshots. `error` never reaches here — it throws.
      if (ev.type === "text-delta" || ev.type === "reasoning-delta" || ev.type === "tool-call") {
        track(opts?.onUpdate?.(snapshot()))
      }
    }
  } catch (error) {
    errored = true
    throw error
  } finally {
    // On the happy path, surface callback errors to the caller. On the
    // error path, the primary failure already wins — swallow secondary
    // rejections so they don't mask it.
    await (errored ? Promise.allSettled(pending) : Promise.all(pending))
  }

  return { finishReason, message: snapshot(), usage }
}
