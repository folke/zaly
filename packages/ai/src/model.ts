import type { AuthProvider } from "./auth.ts"
import type { ContentTransform } from "./content/transform.ts"
import type {
  Context,
  Provider,
  StreamEvent,
  StreamOptions,
  TokenCount,
  Usage,
} from "./provider.ts"
import type { AnyProvider } from "./providers/index.ts"
import type { Attachment, Cost, Message, Modality, ModelSpec, ProviderOptions } from "./types.ts"

import { envAuth } from "./auth.ts"
import { attachmentToMeta } from "./content/compose.ts"
import { createTransform } from "./content/transform.ts"
import { getModel } from "./models.ts"
import { providerRegistry } from "./providers/index.ts"

const ATTACHMENT_KINDS: readonly Attachment["type"][] = ["image", "pdf", "audio", "video"]

/** Apply the model-level transform to one message. Free function
 *  rather than a method so each role's branch can return its own
 *  narrowed `Message<...>` shape — switching on `msg.role` inside a
 *  method that returns `Message` confuses the union assignment. */
function transformMessage(msg: Message, transform: ContentTransform): Message {
  switch (msg.role) {
    // Assistant carries text/reasoning/tool-call only — no attachments.
    case "assistant": {
      return msg
    }
    case "tool": {
      const content = msg.content.map((part) => ({
        ...part,
        content:
          typeof part.content === "string"
            ? part.content
            : (transform.runSync(part.content) as typeof part.content),
      }))
      return { ...msg, content }
    }
    case "system": {
      if (typeof msg.content === "string") return msg
      return { ...msg, content: transform.runSync(msg.content) as typeof msg.content }
    }
    case "user": {
      if (typeof msg.content === "string") return msg
      return { ...msg, content: transform.runSync(msg.content) as typeof msg.content }
    }
  }
}

/** A loaded model, ready to stream. Wraps the underlying `Provider`
 *  with the model id and quirks pre-attached, so callers just supply
 *  `Context` (prompt + messages + tools) and per-call `StreamOptions`.
 *
 *  `provider` is exposed for power-user reuse — a long-running app
 *  with many models on the same endpoint can share the same adapter
 *  instance (and therefore the same fetch / retry / connection pool)
 *  by constructing it once and passing it via `options.fetch`. */
export class Model<T extends AnyProvider = string> {
  readonly id: string
  readonly spec: ModelSpec
  readonly provider: Provider<T>

  // Model-level content transform applied before the provider's
  // pipeline. Currently demotes attachments the model rejects
  // (`canAttach(kind) === false`); future catalog-driven steps land
  // here too. `undefined` when the model accepts everything — common
  // case, short-circuits in `#transform`.
  readonly #transform: ContentTransform | undefined

  constructor(opts: { id: string; spec: ModelSpec; provider: Provider<T> }) {
    this.id = opts.id
    this.spec = opts.spec
    this.provider = opts.provider
    const unsupported = ATTACHMENT_KINDS.filter((k) => !this.canAttach(k))
    if (unsupported.length > 0)
      this.#transform = createTransform().pipe(attachmentToMeta(...unsupported))
  }

  /** Stream a turn against this model. Demotes any attachments the
   *  model doesn't accept (`canAttach(kind) === false`) to `<kind>`
   *  MetaParts before handing the context to the provider — the
   *  provider's wire pipeline then folds those metas into text. Done
   *  at this layer (not in the provider) because attachment support
   *  is catalog metadata, not a wire-format concern, and the model
   *  pre-demote runs *before* the provider pipeline so we don't waste
   *  work inlining bytes for an attachment that's about to be folded
   *  to text anyway.
   *
   *  If the model has catalog cost data, `finish` events get a
   *  populated `usage.cost` breakdown. */
  stream(ctx: Context, opts: StreamOptions = {}): AsyncIterable<StreamEvent> {
    /** Apply the model-level transform to every message's content. No-op
     *  when the model accepts everything (`#transform === undefined`).
     *  Synchronous because the underlying steps are sync and we want
     *  `stream()` to stay sync at the call site. */
    if (this.#transform !== undefined) {
      const messages = ctx.messages.map((m) => transformMessage(m, this.#transform!))
      ctx = { ...ctx, messages }
    }
    // Auto-apply the catalog's max-output budget when the caller didn't
    // override it. Matters for OpenAI: without this the adapter omits
    // `max_tokens` / `max_completion_tokens` and reasoning models burn
    // their implicit cap on thinking, leaving little for the visible
    // reply. Anthropic's adapter has its own internal `?? 4096` fallback
    // — we set the catalog value here so it wins over that default.
    const limit = this.spec.maxTokens ?? this.spec.limit.output
    const maxTokens = Math.min(opts.maxTokens ?? limit, limit)
    const reasoning = this.spec.reasoning ? opts.reasoning : undefined
    const inner = this.provider.stream({
      ctx,
      model: this.spec.id,
      opts: { ...opts, maxTokens, reasoning },
      quirks: this.spec.quirks,
    })
    return this.spec.cost ? this.#augment(inner) : inner
  }

  canAttach(modality: Modality): boolean {
    if (!this.spec.attachment) return false
    return this.spec.modalities.input.includes(modality)
  }

  /** Wrap a provider's stream so the `finish` event's `usage` carries
   *  computed `cost`. All other events pass through unchanged. */
  async *#augment(stream: AsyncIterable<StreamEvent>): AsyncIterable<StreamEvent> {
    for await (const ev of stream) {
      if (this.spec.cost && ev.type === "finish")
        ev.usage = { ...ev.usage, cost: computeCost(ev.usage, this.spec.cost) }
      yield ev
    }
  }
}

/**
 * Primary entry point. Resolves a model id (or an in-memory
 * `ModelOptions`) into a `Model` ready to stream.
 *
 * For catalog ids the options come pre-resolved from the generator
 * — quirks, baseUrl, headers, and maxTokens are baked in at build
 * time. `overrides` apply on top; pass a shared `fetch` here to pool
 * connection / retry state across many models.
 *
 * For inline `ModelOptions` the caller supplies everything, which is
 * how users add models to their local `addModels` catalog or register
 * one-off specs without committing them globally.
 */
export async function loadModel(
  source: string | ModelSpec,
  overrides?: Partial<ProviderOptions>,
  auth: AuthProvider = envAuth
): Promise<Model> {
  // Full model URI. Get from the catalog if it's a string; if it's already a spec, construct
  const id =
    typeof source === "string"
      ? source
      : `${source.providerInfo?.id ?? source.provider}/${source.id}`

  const base = typeof source === "string" ? await getModel(source) : source
  if (base === undefined) {
    throw new Error(
      `Unknown model "${id}". Use \`addModels({ "${id}": { … } })\` to register a custom one.`
    )
  }
  const spec: ModelSpec = { ...base, ...overrides }
  const creds = await auth.getAuth(spec)
  const provider = await providerRegistry.load(spec.provider, {
    ...spec,
    apiKey: spec.apiKey ?? creds?.apiKey,
    headers: { ...creds?.headers, ...spec.headers },
  })

  return new Model({ id, provider, spec })
}

/** Compute per-field USD cost from token counts + a price table.
 *  Models.dev prices are USD per million tokens. Cache reads/writes
 *  fall back to the input price when the catalog doesn't break them
 *  out (rare — most providers publish all three).
 *
 *  `usage.input` is already the uncached portion (see `TokenCount`
 *  docs), so each tier multiplies by its own price directly — no
 *  subtraction needed. */
function computeCost(usage: Usage, prices: Cost): TokenCount {
  const cacheRead = usage.cacheRead ?? 0
  const cacheWrite = usage.cacheWrite ?? 0
  const M = 1_000_000
  const cost: TokenCount = {
    input: (usage.input * prices.input) / M,
    output: (usage.output * prices.output) / M,
  }
  if (cacheRead > 0) cost.cacheRead = (cacheRead * (prices.cache_read ?? prices.input)) / M
  if (cacheWrite > 0) cost.cacheWrite = (cacheWrite * (prices.cache_write ?? prices.input)) / M
  if (usage.reasoning !== undefined && prices.reasoning !== undefined) {
    cost.reasoning = (usage.reasoning * prices.reasoning) / M
  }
  return cost
}
