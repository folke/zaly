import type { AnyPart, ContentTransform } from "./content/transform.ts"
import type {
  CollectOptions,
  Context,
  Provider,
  StreamEvent,
  StreamOptions,
  TokenCount,
  Usage,
} from "./provider.ts"
import type { AnyProvider } from "./providers/registry.ts"
import type { Attachment, Cost, Message, Modality, ModelSpec } from "./types.ts"

import { authenticate } from "./auth/auth.ts"
import { attachmentToMeta } from "./content/compose.ts"
import { createTransform } from "./content/transform.ts"
import { getModel } from "./models.ts"
import { collect } from "./provider.ts"
import { providerRegistry } from "./providers/registry.ts"
import { pairedToolIds } from "./tools.ts"
import { withRetry } from "./utils/retry.ts"

const ATTACHMENT_KINDS: readonly Attachment["type"][] = ["image", "pdf", "audio", "video"]

export type AssistantMessage = Omit<Message<"assistant">, "meta"> & {
  meta: Required<NonNullable<Message<"assistant">["meta"]>>
}

export type ModelStreamOptions = Omit<StreamOptions, "model" | "quirks"> & CollectOptions

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
  readonly #ct: ContentTransform<AnyPart>

  constructor(opts: { id: string; spec: ModelSpec; provider: Provider<T> }) {
    this.id = opts.id
    this.spec = opts.spec
    this.provider = opts.provider
    this.#ct = createTransform<AnyPart>()
    const unsupported = ATTACHMENT_KINDS.filter((k) => !this.canAttach(k))
    if (unsupported.length > 0) this.#ct = this.#ct.pipe(attachmentToMeta(...unsupported))
  }

  #transform(messages: Message[], opts: StreamOptions): Message[] {
    const toolIds = pairedToolIds(messages)
    let ct = this.#ct
    ct = ct
      .map("tool-result", (part) => (toolIds.has(part.id) ? part : undefined))
      .map("tool-call", (part) => (toolIds.has(part.id) ? part : undefined))
    const ret: Message[] = []
    const reasoning = opts.reasoning && opts.reasoning.effort !== "off"
    for (const m of messages) {
      let mct = ct
      // Drop reasoning if model ids don't match or reasoning is disabled
      if (m.role === "assistant" && (!reasoning || m.meta?.modelId !== this.id))
        mct = mct.drop("reasoning")
      const t = mct.runMessageSync(m)
      if (t !== undefined) ret.push(t)
    }
    return ret
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
  #stream(ctx: Context, opts: StreamOptions = {}): AsyncIterable<StreamEvent> {
    const streamOpts: StreamOptions = {
      ...opts,
      caching: opts.caching ?? true,
      maxTokens: opts.maxTokens ? Math.min(opts.maxTokens, this.spec.maxTokens) : undefined,
      reasoning: this.spec.reasoning ? opts.reasoning : undefined,
    }

    /** Apply the model-level transform to every message's content. No-op
     *  when the model accepts everything (`#transform === undefined`).
     *  Synchronous because the underlying steps are sync and we want
     *  `stream()` to stay sync at the call site. */
    const messages = this.#transform(ctx.messages, streamOpts)

    return this.provider.stream({
      ctx: { ...ctx, messages },
      model: this.spec,
      opts: streamOpts,
    })
  }

  async stream(ctx: Context, opts: ModelStreamOptions = {}): Promise<AssistantMessage> {
    const ret = await collect(this.#stream(ctx, opts), opts)
    const meta = {
      ...ret.message.meta, // just in case so that we capture future provider-level meta
      finishReason: ret.finishReason,
      modelId: this.id,
      usage: {
        ...ret.usage,
        cost: this.spec.cost ? computeCost(ret.usage, this.spec.cost) : undefined,
      },
    }
    return { ...ret.message, meta }
  }

  canAttach(modality: Modality): boolean {
    return this.spec.input.includes(modality)
  }
}

/**
 * Load a model by id or id with overrides.
 * The id is looked up in the catalog for a base spec, which is then
 * overridden by any fields in the input spec.
 */
export async function loadModel(
  model: string | ({ id: string } & Partial<ModelSpec>)
): Promise<Model> {
  const id = typeof model === "string" ? model : model.id
  const overrides = typeof model === "string" ? {} : model
  const base = await getModel(id)
  if (base === undefined)
    throw new Error(`Unknown model "${id}". Use \`registerModel()\` to register a custom one.`)
  const spec: ModelSpec = { ...base, ...overrides }
  const creds = await authenticate(spec)
  const provider = await providerRegistry.load(spec.api, {
    ...spec,
    apiKey: creds?.apiKey ?? spec.apiKey,
    // Default retry on the request side — pre-stream only (`withRetry`
    // never restarts a body that's already started consuming, which
    // would waste already-generated tokens). Covers connection
    // resets, 5xx, 429s. Mid-stream SSE failures still propagate.
    // Callers can pass their own `fetch` to opt out / customise.
    fetch: withRetry(spec.fetch ?? fetch),
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
