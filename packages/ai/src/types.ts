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

import type { AnyProvider } from "./providers/index.ts"

/** Plain text in user, assistant, or tool-result content. */
export interface TextPart {
  type: "text"
  text: string
  /** Renderer hint for how to display the text — free-form format
   *  identifier ("json", "markdown", "typescript", "diff", "html", …).
   *  Providers ignore this field; only `text` reaches the model. The
   *  TUI uses it to pick a syntax highlighter or markdown renderer. */
  format?: string
}

/** Structured metadata embedded in tool-result content (and potentially
 *  other places). Survives end-to-end as a structured part so the TUI
 *  can render it richly; collapses to a `<tag>JSON</tag>` `TextPart` at
 *  the provider boundary via `transformMeta` (in `@zaly/ai/format`) so
 *  the model sees a clean XML-tagged block.
 *
 *  Use cases:
 *    - Truncation summaries: `{ tag: "truncation", data: { total: 1200, fullPath: "..." } }`
 *    - Tool status: `{ tag: "shell", data: { status: "running", id: "sh_abc" } }`
 *    - Mid-conversation system notes: `{ tag: "system", data: "user reset the file" }`
 *    - Generic tool ack: `{ data: { ok: true, bytes: 234 } }` → wraps in `<meta>`
 *
 *  `data` is `unknown` so callers can pass either a string (used
 *  verbatim) or any object (JSON-stringified at flatten-time). */
export interface MetaPart {
  type: "meta"
  data: unknown
  /** XML wrapper tag. Defaults to `"meta"`. Use a semantic tag when the
   *  meta has clear intent the model should recognize (`"truncation"`,
   *  `"shell"`, `"system"`). Stay consistent across tools for the same
   *  concept. */
  tag?: string
}

export type FilePart<T extends string = string, MT extends string = string> = {
  type: T
  mime: MT
  source:
    | { type: "base64"; data: string }
    | { type: "url"; url: string }
    | { type: "file"; path: string }
}

export type FilePartSource = FilePart["source"]

export type ImagePart = FilePart<"image", "image/png" | "image/jpeg" | "image/webp"> & {
  detail?: "low" | "high" | "auto"
}

export type PdfPart = FilePart<"pdf", "application/pdf">

export type AudioPart = FilePart<"audio", "audio/mpeg" | "audio/wav">

export type VideoPart = FilePart<"video", "video/mp4" | "video/webm">

export type Attachment = ImagePart | PdfPart | AudioPart | VideoPart

/** Assistant-emitted tool invocation. `args` is the decoded argument
 *  object — adapters JSON-encode when a provider expects a string. */
export interface ToolCallPart {
  type: "tool-call"
  id: string
  name: string
  params: unknown
}

/** Structured error info captured when a tool's `call` throws a
 *  `ToolError` (or any other error wrapped as one). The model only
 *  reads the formatted error from `ToolResultPart.content`; this
 *  field is metadata the TUI / logger can render richly (badge for
 *  `code`, JSON block for `data`, retry icon, color by category). */
export interface ToolErrorInfo {
  code: string
  message: string
  data?: unknown
  retryable?: boolean
}

export type ContentPart = TextPart | MetaPart | Attachment
export type Content = string | ContentPart[]

/** Tool response carried on a `tool`-role message. `content` mirrors
 *  user-message shape: a string for the common stringified case, or
 *  an ordered array for rich results that mix text with image / pdf /
 *  audio / video parts (e.g. a screenshot tool returning a description
 *  plus the bytes).
 *
 *  Provider serialization:
 *    - Anthropic: `tool_result.content[]` supports text + image blocks
 *      natively; passes through.
 *    - OpenAI Chat Completions: tool message content is string-only.
 *      Adapter joins text parts as the tool message body and emits a
 *      synthetic user message immediately after carrying any non-text
 *      parts (images / pdf / audio / video). */
export interface ToolResultPart {
  type: "tool-result"
  id: string
  name: string
  content: Content
  isError?: boolean
  /** Set when `isError: true` and a structured `ToolError` was caught.
   *  Invisible to providers — pure metadata for downstream consumers. */
  error?: ToolErrorInfo
  /** Sidecar payload the tool wrote to `ctx.meta` during the call —
   *  not serialized to the wire, not shown to the model. Rides alongside
   *  this result in the message list so other tools and the TUI can
   *  inspect it later (e.g. file freshness derives the most recent
   *  observed `mtime` for a path by scanning these). Disappears with the
   *  message itself on compaction or masking — that's the point: when
   *  the conversation no longer contains the read, the model genuinely
   *  hasn't seen the file, and write/edit will demand a re-read.
   *
   *  `ToolMeta` is an empty interface that tool packages extend via
   *  declaration merging:
   *
   *  ```ts
   *  declare module "@zaly/ai" {
   *    interface ToolMeta {
   *      file?: { kind: "read" | "write" | "edit"; path: string; mtime: number }
   *    }
   *  }
   *  ``` */
  meta?: ToolMeta
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
 *  tool choice, response format) use the top-level `StreamOptions`
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
type M =
  | {
      role: "system"
      /** String for the common case; `(TextPart | MetaPart)[]` when the
       *  message wants to ride structured metadata to downstream consumers
       *  (e.g. the TUI rendering carry-over wakeup hints, task completion
       *  details, or heartbeat pulses). Provider adapters flatten meta to
       *  XML-tagged text on the wire — the model sees identical content
       *  either way. */
      content: string | (TextPart | MetaPart)[]
      cache?: CacheHint
      providerOptions?: ProviderOptions
    }
  | {
      role: "user"
      content: string | (TextPart | MetaPart | Attachment)[]
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

export type Message<T extends M["role"] = M["role"]> = Extract<M, { role: T }>

/** A callable tool exposed to the model.
 *
 *  `input` is a JSON Schema for the tool's arguments. Adapters
 *  translate it into the provider's shape (`function.parameters` on
 *  OpenAI, `input_schema` on Anthropic). `output` is optional — MCP
 *  tools that declare a return schema get it wired; pure tools skip it.
 *
 *  `validateInput` runs before `execute` — it coerces LLM quirks
 *  (stringified numbers, missing optionals) and throws a human-readable
 *  error on schema mismatch. The kernel catches the throw, formats it
 *  back to the model as a `tool-result` with `isError: true`, and the
 *  model self-corrects next turn.
 *
 *  The `_types` phantom is there so callers can narrow `result` by name
 *  when they own both the definition and the consumer. It carries no
 *  runtime value and is erased at compile time. */
/** Per-call context handed to tools at dispatch time. Most tools ignore
 *  it; rich tools (bash, future browser, anything that wants permission
 *  checks or session-scoped state) read from it.
 *
 *  Extensible via TypeScript declaration merging — each module that
 *  needs to expose a context capability declares its own slice:
 *
 *  ```ts
 *  // in @zaly/agent/src/types.ts
 *  declare module "@zaly/ai" {
 *    interface ToolContext {
 *      perms?: PermissionManager
 *      spawns?: SpawnRegistry
 *      files?: FileTracker
 *    }
 *  }
 *  ```
 *
 *  After the augmenting module is imported anywhere in the project,
 *  tools see fully-typed access to those keys without casts. */
export interface ToolContext {
  /** Session cwd — anchor for path resolution and bash-spawn cwd. */
  cwd?: string
  /** Agent-level abort. Tools that spawn long-running work should pass
   *  this through to `Spawn`/`fetch` so cancellation propagates. */
  signal?: AbortSignal
  /** Per-call sidecar slot. `runTool` initialises this to a fresh `{}`
   *  on a per-call copy of the ctx; tools mutate it during execution
   *  (`ctx.meta.file = { ... }`) to record machine-readable breadcrumbs
   *  that survive into `ToolResultPart.meta`. Wire-invisible — the model
   *  never sees this. Use `ToolMeta` declaration merging to type the
   *  shape; see the type below. */
  meta?: ToolMeta
}

/** Open shape for sidecar metadata tools attach to a result. Empty by
 *  default; tool packages extend it via TypeScript declaration merging:
 *
 *  ```ts
 *  // in @zaly/agent/tools/read.ts
 *  declare module "@zaly/ai" {
 *    interface ToolMeta {
 *      file?: { kind: "read" | "write" | "edit"; path: string; mtime: number }
 *    }
 *  }
 *  ```
 *
 *  Each tool that introduces a new field declares it next to the tool
 *  itself. Once the augmenting module is imported anywhere in the
 *  project, every tool's `ctx.meta` and every `ToolResultPart.meta`
 *  picks up the field with full types — no casts, no central registry. */
// oxlint-disable-next-line typescript/no-empty-interface
export interface ToolMeta {}

export interface Tool<Params = unknown, Result = unknown> {
  name: string
  desc?: string
  params: unknown
  result?: unknown
  /** When `true`, multiple in-flight calls of this tool from the same
   *  assistant message run concurrently. When `false` (default), the
   *  harness chains them: a slow call promotes to a background task and
   *  subsequent calls become pending tasks that start only after their
   *  predecessor completes. Tools with side-effects (write, edit, install)
   *  should keep the default; pure-read tools (read, fetch, list) can opt
   *  in by setting `parallel: true`. */
  parallel?: boolean
  validateParams(params: unknown): Params
  validateResult?(result: unknown): Awaited<Result>
  call(params: Params, ctx: ToolContext): Promise<Result>
  _types?: { input: Params; output: Result }
}

/** A long-running tool result. Tools that may take longer than the
 *  harness's grace window return one of these instead of a `ToolResult`,
 *  letting the harness race completion against the grace and either
 *  surface the final result or promote the work to a background task.
 *
 *  - `poll()` is synchronous and returns the current state — partial or
 *    final. After `running` flips to `false`, subsequent calls return
 *    the same final snapshot. **Advances any internal cursor**: a tool
 *    that streams incremental output (bash) returns only what's new
 *    since the previous poll.
 *  - `hasNew?()` is the non-consuming companion: returns `true` if a
 *    `poll()` right now would produce non-empty new content. Heartbeats
 *    use it to flag tasks worth polling. Tools without progressive
 *    output can omit it; consumers fall back to "no hint".
 *  - `done` resolves when `poll().running` would flip to `false`. Never
 *    rejects — completion is reflected in the snapshot, not as an error.
 *  - `abort()` requests termination of the underlying work. Idempotent.
 *
 *  Tool authors don't need to know about Tasks or the agent loop — they
 *  return a Streamable, the harness handles the rest. The runtime guard
 *  `isStreamable` (in `@zaly/ai/tools`) detects this shape. */
export interface Streamable {
  poll(): ToolResult & { running: boolean }
  hasNew?(): boolean
  done: Promise<void>
  abort(): void
}

/** Normalised tool execution outcome — maps 1:1 to `ToolResultPart`.
 *  `isError: true` is the LLM-facing signal that the call failed; the
 *  `content` field carries the tool's success output (string or rich
 *  part array) or a formatted error payload the model should read.
 *  `error` carries structured info for richer downstream rendering;
 *  `meta` is wire-invisible sidecar data the tool wrote to `ctx.meta`. */
export interface ToolResult {
  isError: boolean
  content: Content
  error?: ToolErrorInfo
  meta?: ToolMeta
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
  /** Honor `CacheHint`s placed by the harness. Default `true`.
   *
   *  Adapter behaviour when `false`: cache hints are ignored and no
   *  provider-side cache markers are sent. Useful as a debugging
   *  kill-switch or when a caller wants strict per-token billing.
   *
   *  Only affects providers with explicit, opt-in cache APIs
   *  (Anthropic `cache_control`). OpenAI's prefix caching is automatic
   *  and unaffected by this flag. */
  caching?: boolean
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
export interface ModelSpec extends ProviderOptions, Omit<ModelInfo, "provider"> {
  /** Provider name — e.g. `"openai"`, `"openrouter"`. Resolves against
   *  the runtime catalog to pick the adapter family. */
  provider: AnyProvider
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
