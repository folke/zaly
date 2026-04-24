/**
 * Core message primitives for the zaly AI layer.
 *
 * Shape is OpenAI's role layout (`system` / `user` / `assistant` / `tool`
 * as discrete messages, tool results on their own role) combined with
 * Anthropic-style ordered content parts so interleaved text + tool calls
 * round-trip faithfully where the provider supports it. Provider-specific
 * hints (cache markers, reasoning effort, …) live in an open
 * `providerOptions` bag so core types stay provider-agnostic.
 *
 * Adapter translation rules live in the per-provider modules; see
 * `design.sketch.ts` at the package root for the side-by-side comparison.
 */

/** Plain text in user or assistant content. */
export interface TextPart {
  type: "text"
  text: string
}

/** Assistant-emitted tool invocation. `args` is the decoded argument
 *  object — adapters JSON-encode when a provider expects a string. */
export interface ToolCallPart {
  type: "tool-call"
  id: string
  name: string
  args: unknown
}

/** Tool response carried on a `tool`-role message. `result` is left as
 *  `unknown` — callers narrow by `name` when they own both sides. */
export interface ToolResultPart {
  type: "tool-result"
  id: string
  name: string
  result: unknown
  isError?: boolean
}

/** Assistant reasoning (Anthropic "thinking", OpenAI reasoning models).
 *  Providers that require the reasoning block to round-trip verbatim
 *  (Anthropic during tool-use cycles) use `signature` as an opaque
 *  token the adapter preserves. */
export interface ReasoningPart {
  type: "reasoning"
  text: string
  signature?: string
}

/** Per-request escape hatches keyed by provider. Adapters read the
 *  keys they own; unknown keys are ignored. Use this only for
 *  power-user knobs that only make sense on one provider
 *  (`logit_bias`, `service_tier`, OpenRouter routing preferences,
 *  Anthropic metadata, etc.) — for cross-cutting concerns (reasoning,
 *  tool choice, response format) use the top-level `GenerateRequest`
 *  fields instead. */
export interface RequestProviderOptions {
  openai?: Record<string, unknown>
  anthropic?: Record<string, unknown>
  openrouter?: Record<string, unknown>
  google?: Record<string, unknown>
  [provider: string]: Record<string, unknown> | undefined
}

/** Cross-provider cache hint attached to a message. The harness
 *  places these at stable cut-points (tool defs, system prompt, last
 *  stable turn) as part of its context-assembly policy.
 *
 *  - Anthropic: emits `cache_control: { type: "ephemeral" }` on the
 *    last content block of the tagged message.
 *  - OpenAI: no-op (prefix caching is automatic; the adapter already
 *    keeps prefixes byte-stable, which is all OpenAI needs). */
export interface CacheHint {
  type: "ephemeral"
}

/** A message in the conversation. Role layout follows OpenAI Chat
 *  Completions (system / user / assistant / tool as separate messages);
 *  assistant content is an ordered array of parts so text + tool calls
 *  can interleave on providers that support it.
 *
 *  String shorthands on `user` and `assistant` expand to a single
 *  `TextPart` — they're there for ergonomics, not a different shape. */
export type Message =
  | {
      role: "system"
      content: string
      cache?: CacheHint
      providerOptions?: ProviderOptions
    }
  | {
      role: "user"
      content: string | TextPart[]
      cache?: CacheHint
      providerOptions?: ProviderOptions
    }
  | {
      role: "assistant"
      content: string | (TextPart | ReasoningPart | ToolCallPart)[]
      cache?: CacheHint
      providerOptions?: ProviderOptions
    }
  | {
      role: "tool"
      content: ToolResultPart[]
      cache?: CacheHint
      providerOptions?: ProviderOptions
    }

/** A callable tool exposed to the model.
 *
 *  `schema` is a JSON Schema for the tool's input. Adapters translate
 *  it into the provider's shape (`function.parameters` on OpenAI,
 *  `input_schema` on Anthropic).
 *
 *  `validateInput` runs before `execute` — it coerces LLM quirks
 *  (stringified numbers, missing optionals) and throws a human-readable
 *  error on schema mismatch. The kernel catches the throw, formats it
 *  back to the model as a `tool-result` with `isError: true`, and the
 *  model self-corrects next turn. `validateOutput` is optional; MCP
 *  tools that declare an output schema get it wired, pure tools skip it.
 *
 *  The `_types` phantom is there so callers can narrow `result` by name
 *  when they own both the definition and the consumer. It carries no
 *  runtime value and is erased at compile time. */
export interface Tool<Input = unknown, Output = unknown> {
  name: string
  description?: string
  schema: unknown
  validateInput(args: unknown): Input
  validateOutput?(result: unknown): Output
  execute(input: Input): Promise<Output>
  _types?: { input: Input; output: Output }
}

// ── Catalog types ────────────────────────────────────────────────────────
//
// Shape matches the models.dev Zod schema one-to-one so we can read the
// catalog JSON without transformation. Field names stay snake_case for
// that reason — breaking the usual TS camelCase convention is the right
// call here because every field a user sees here is already snake_case
// in the models.dev catalog and we want parseable identity.

/** JSON value — used for opaque provider `body` / `headers` overrides
 *  that pass through verbatim to the wire. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

/** Input/output modality. */
export type Modality = "text" | "audio" | "image" | "video" | "pdf"

/** Per-tier cost. Values are USD per **million tokens** (models.dev
 *  convention). Optional fields are only present when the provider
 *  publishes distinct pricing for that axis. */
export interface Cost {
  input: number
  output: number
  reasoning?: number
  cache_read?: number
  cache_write?: number
  input_audio?: number
  output_audio?: number
}

/** Per-model provider overrides. When present, the adapter applies
 *  these on top of the preset defaults — lets individual models in a
 *  catalog target a different npm module, base URL, wire shape, or
 *  inject extra headers / body fields. Rare but used by hybrid
 *  catalogs (google-vertex, some aggregators). */
export interface ModelProviderOverride {
  npm?: string
  api?: string
  shape?: "completions" | "responses"
  body?: Record<string, JsonValue>
  headers?: Record<string, string>
}

/** Experimental / preview modes for a model. Keys are mode names
 *  (`"search"`, `"vision"`, …) — providers use them to expose beta
 *  behaviour behind extra request fields. */
export type ExperimentalModes = Record<
  string,
  {
    cost?: Cost
    provider?: {
      body?: Record<string, JsonValue>
      headers?: Record<string, string>
    }
  }
>

/** Metadata for one model. One-to-one with the models.dev `Model`
 *  schema. Loaded lazily per-provider via `getModel(id)` or eagerly
 *  via `listModels()`.
 *
 *  Runtime invariant enforced by the catalog (not by the TS type):
 *  when `reasoning === false`, `cost.reasoning` is absent. */
export interface ModelInfo {
  /** Model id local to its provider — e.g. `"gpt-4o"` or
   *  `"claude-sonnet-4-5"`. The full URI is constructed by the
   *  caller as `"<provider>/<id>"`. */
  id: string
  name: string
  /** Loose family grouping (`"gpt"`, `"claude"`, `"gemini"`, …).
   *  Informational; adapters don't branch on it. */
  family?: string
  /** Accepts file attachments (images / pdfs / etc.). */
  attachment: boolean
  /** Emits reasoning / thinking tokens. */
  reasoning: boolean
  /** Supports tool calling. Informational — we filter non-tool models
   *  out of the generated catalog, so at runtime this is effectively
   *  always true. Optional to make `addModels` ergonomic. */
  tool_call?: boolean
  /** Reasoning tokens interleave with output.
   *  - `true` — field defaults to `"reasoning_content"`.
   *  - `{ field }` — explicit field name (`"reasoning_content"` on
   *    most OpenAI-compatibles; `"reasoning_details"` on a few). */
  interleaved?: true | { field: "reasoning_content" | "reasoning_details" }
  /** Supports `response_format: { type: "json_schema", … }`. */
  structured_output?: boolean
  /** Accepts a `temperature` parameter. Reasoning models typically
   *  set this `false` (temperature is ignored or rejected). */
  temperature?: boolean
  /** Knowledge cutoff in `YYYY-MM` or `YYYY-MM-DD`. */
  knowledge?: string
  /** Release date in `YYYY-MM` or `YYYY-MM-DD`. Informational. */
  release_date?: string
  /** Last catalog update in `YYYY-MM` or `YYYY-MM-DD`. Informational. */
  last_updated?: string
  modalities: {
    input: Modality[]
    output: Modality[]
  }
  /** Model weights are publicly released. Informational. */
  open_weights?: boolean
  /** Pricing per million tokens. `context_over_200k` is the higher
   *  tier some providers bill for prompts over 200K tokens. */
  cost?: Cost & { context_over_200k?: Cost }
  limit: {
    context: number
    input?: number
    output: number
  }
  /** Lifecycle signal. `"deprecated"` entries are filtered out of our
   *  generated slices so this narrows to `"alpha" | "beta" | undefined`
   *  in practice, but the type includes `"deprecated"` for callers
   *  that read the raw catalog. */
  status?: "alpha" | "beta" | "deprecated"
  experimental?: {
    modes?: ExperimentalModes
  }
  provider?: ModelProviderOverride
}

/** Metadata for one provider endpoint — one-to-one with the
 *  models.dev `Provider` schema. */
export interface ProviderInfo {
  id: string
  /** Env-var names consulted for credentials, in priority order.
   *  The first element is the conventional one (`OPENAI_API_KEY`
   *  etc.); downstream entries are fallbacks. */
  env: string[]
  /** npm module the Vercel AI SDK uses for this provider. Our
   *  generator uses it to classify the adapter family
   *  (`@ai-sdk/openai`, `@ai-sdk/anthropic`, …). Not loaded at
   *  runtime by us. */
  npm: string
  /** Base URL — required for `@ai-sdk/openai-compatible` and
   *  `@openrouter/ai-sdk-provider`; optional for `@ai-sdk/openai`
   *  and `@ai-sdk/anthropic` (their adapters have a default). */
  api?: string
  name: string
  /** Docs link for this provider's model list. */
  doc: string
  models: Record<string, ModelInfo>
}

// ── Runtime API types ───────────────────────────────────────────────────

/** Callable shape of `fetch`. Duplicated here (rather than imported
 *  from `./utils/retry.ts`) so `types.ts` stays free of runtime
 *  imports — types.ts is the leaf module every other file depends on. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

/** Adapter-construction config. Generic across provider families;
 *  adapter-specific wire quirks live in `Quirks` below so the options
 *  shape stays uniform regardless of which family is used. */
export interface ProviderOptions {
  /** API key. Falls back to the first env var in `ProviderInfo.env`. */
  apiKey?: string
  /** Base URL override. Falls back to `ProviderInfo.api`. */
  baseUrl?: string
  /** Extra headers merged onto every request. */
  headers?: Record<string, string>
  /** Fetch impl — injection point for retry wrappers, proxies,
   *  instrumentation. Defaults to the platform `fetch`. */
  fetch?: FetchLike
}

/** Provider-specific wire quirks that "OpenAI compatibility" doesn't
 *  actually cover. Each field names an axis of variation with a
 *  typed union of known shapes; adapters read these and dispatch.
 *
 *  Populated by `getModel` from `assets/quirks.json` — provider-level
 *  defaults overlaid with per-model overrides. Users can further
 *  override per-model via `addModels` or per-call via the request's
 *  `quirks` field.
 *
 *  Add new axes here as they surface; start minimal. */
export interface Quirks {
  /** Which wire field carries the max-output-tokens cap. OpenAI
   *  deprecated `max_tokens` in favour of `max_completion_tokens`
   *  (required for reasoning models); most third-parties still only
   *  accept `max_tokens`. */
  maxTokensField?: "max_tokens" | "max_completion_tokens"

  /** How the provider expects reasoning / thinking requests shaped.
   *  - `"openai"`              → `reasoning_effort: "minimal|low|medium|high"`
   *  - `"openrouter"`          → `reasoning: { effort }`
   *  - `"deepseek"`            → `thinking: { type: "enabled" }` + `reasoning_effort`
   *  - `"zai"` / `"qwen"`      → top-level `enable_thinking: boolean`
   *  - `"qwen-chat-template"`  → `chat_template_kwargs.enable_thinking` */
  thinkingFormat?: "openai" | "openrouter" | "deepseek" | "zai" | "qwen" | "qwen-chat-template"

  /** Which effort levels this model actually accepts. Adapter clamps
   *  unsupported values to the nearest supported one — `"xhigh"` on
   *  pre-GPT-5.4 → `"high"`, `"minimal"` on o1/o3 → `"low"`. Unset
   *  means any level is accepted. */
  reasoningLevels?: ("off" | "minimal" | "low" | "medium" | "high" | "xhigh")[]

  /** Streaming delta field that carries reasoning tokens.
   *  - `"reasoning"` (OpenRouter, most third-parties)
   *  - `"reasoning_content"` (DeepSeek-ish)
   *  - `"reasoning_details"` (structured form on a few providers)
   *  If unset, adapter accepts any of the three. */
  reasoningField?: "reasoning" | "reasoning_content" | "reasoning_details"

  /** Model accepts `temperature`. Default derived from
   *  `ModelInfo.temperature` (catalog field); set here to override. */
  temperatureSupported?: boolean

  /** Model supports `strict: true` on tool definitions. Default false. */
  strictTools?: boolean
}

/** Everything needed to construct a `Model`. For catalog ids this is
 *  what `getModel` returns, pre-resolved at build time from the
 *  models.dev snapshot + quirks overlay. For custom models, users
 *  author it directly (either inline or via `addModels`).
 *
 *  Shape is a flat fusion of:
 *    - `ProviderOptions` (apiKey/baseUrl/headers/fetch — adapter-level knobs)
 *    - every field from `ModelInfo` except `provider` (renamed below
 *      to avoid collision with the provider-name identity)
 *    - a handful of runtime additions (providerInfo, maxTokens, quirks)
 *
 *  Collapsing ModelInfo in avoids the `options.info.limit.context`
 *  ceremony; everything a user touches lives at one level. */
export interface ModelOptions extends ProviderOptions, Omit<ModelInfo, "provider"> {
  /** Provider name — e.g. `"openai"`, `"openrouter"`. Resolves against
   *  the runtime catalog to pick the adapter family. */
  provider: string
  /** Per-model wire override (renamed from `ModelInfo.provider`). When
   *  set, fields on this object take precedence over the provider's
   *  defaults — used by a minority of catalog entries to route a
   *  specific model to a different npm, endpoint, shape, or add
   *  custom body/headers. */
  providerOverride?: ModelInfo["provider"]
  /** Endpoint info. Auto-filled from the runtime catalog when
   *  `provider` resolves to a known entry; supply here for custom
   *  providers. */
  providerInfo?: ProviderInfo
  /** Default `maxTokens` for requests through this model. Unset →
   *  adapter uses `limit.output` at request time. */
  maxTokens?: number
  /** Adapter-dispatch quirks. See `Quirks`. */
  quirks?: Quirks
}
