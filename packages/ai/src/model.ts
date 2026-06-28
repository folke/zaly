import type { Logger } from "@zaly/shared/logger"
import type { ContentTransform } from "./content/transform.ts"
import type { ModelFilter } from "./models/filter.ts"
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
import type {
  AnyPart,
  Attachment,
  Cost,
  Message,
  Modality,
  ModelProvider,
  ModelSpec,
} from "./types.ts"

import { toError } from "@zaly/shared"
import { BaseCollection } from "@zaly/shared/collection"
import { AuthManager } from "./auth/manager.ts"
import { attachmentToMeta } from "./content/compose.ts"
import { createTransform } from "./content/transform.ts"
import { getModel, loadCatalog } from "./models/catalog.ts"
import { filterModels } from "./models/filter.ts"
import { collect } from "./provider.ts"
import { providerRegistry } from "./providers/registry.ts"
import { pairedToolIds } from "./tools.ts"
import { withRetry } from "./utils/retry.ts"

const ATTACHMENT_KINDS: readonly Attachment["type"][] = ["image", "pdf", "audio", "video"]

export type AssistantMessage = Omit<Message<"assistant">, "meta"> & {
  meta: Required<NonNullable<Message<"assistant">["meta"]>>
}

export type ModelStreamOptions = Omit<StreamOptions, "model" | "quirks"> & CollectOptions
export type ModelOpts = string | ({ id: string } & Partial<ModelSpec>)
export type { ModelCollection }

/** Split a model URI into `{ provider, model }`. Throws on malformed
 *  input — a typo at the call site is more useful surfaced here than
 *  via a downstream "unknown provider" error.
 *
 *  Examples:
 *    `"anthropic/claude-sonnet-4-5"` → `{ provider: "anthropic", model: "claude-sonnet-4-5" }`
 *    `"openrouter/kimi/k2"`          → `{ provider: "openrouter", model: "kimi/k2" }` */
export function parseModelId(id: string): { provider: string; model: string } {
  const [, provider, model] = /^([^/]+)\/(.+)$/.exec(id) ?? []
  if (!provider || !model) {
    throw new Error(
      `Invalid model id "${id}": expected "<provider>/<model>" (e.g. "anthropic/claude-sonnet-4-5").`
    )
  }
  return { model, provider }
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
  model: ModelOpts,
  base?: ModelSpec,
  ctx?: ModelCtx
): Promise<Model> {
  const id = typeof model === "string" ? model : model.id
  const overrides = typeof model === "string" ? {} : model
  base ??= await getModel(id)
  if (base === undefined)
    throw new Error(`Model \`${id}\` not found. Has the model been registered?`)
  const spec: ModelSpec = { ...base, ...overrides }
  const auth = ctx?.auth ?? AuthManager.basic()
  const provider = await providerRegistry.load(spec.api, {
    ...spec,
    apiKey: () => auth.getAuth(spec),
    // Default retry on the request side — pre-stream only (`withRetry`
    // never restarts a body that's already started consuming, which
    // would waste already-generated tokens). Covers connection
    // resets, 5xx, 429s. Mid-stream SSE failures still propagate.
    // Callers can pass their own `fetch` to opt out / customise.
    fetch: withRetry(spec.fetch ?? fetch),
    headers: spec.headers,
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

export type ModelCtx = {
  auth?: AuthManager
  logger?: Logger
}

class ModelCollection extends BaseCollection<
  Model | undefined,
  Promise<ModelSpec[]>,
  ModelProvider
> {
  #auth?: AuthManager
  #logger?: Logger
  #specCache = new Map<string, ModelSpec[]>()

  constructor(opts: ModelCtx = {}) {
    super(undefined)
    this.#auth = opts.auth
    this.#logger = opts.logger
  }

  get auth(): AuthManager | undefined {
    return this.#auth
  }

  async #specs(provider: ModelProvider): Promise<ModelSpec[]> {
    const cached = this.#specCache.get(provider.id)
    if (cached) return cached
    try {
      const specs = await loadCatalog().then((c) => c.modelSpecs(provider))
      this.#specCache.set(provider.id, specs)
      return specs
    } catch (error) {
      this.#specCache.set(provider.id, [])
      if (this.#logger)
        this.#logger.error(
          `Failed to load model specs for provider \`${provider.id}\`:\n${toError(error).message}`
        )
      else throw error
    }
    return []
  }

  async #registeredSpecs(): Promise<ModelSpec[]> {
    const specs = await Promise.all(this.registered.map((p) => this.#specs(p)))
    const ret: Record<string, ModelSpec> = {}
    for (const spec of specs.flat()) ret[spec.id] = spec
    return Object.values(ret)
  }

  async get(id: string): Promise<ModelSpec | undefined> {
    const { provider: pid } = parseModelId(id)
    const provider = this.registered.findLast((r) => r.id === pid)
    const specs = provider ? await this.#specs(provider) : undefined
    const spec = specs?.find((s) => s.id === id)
    return spec ?? (await getModel(id))
  }

  async load(opts: ModelOpts): Promise<Model> {
    const id = typeof opts === "string" ? opts : opts.id
    return loadModel(opts, await this.get(id), this.#auth)
  }

  async list(filter?: ModelFilter): Promise<ModelSpec[]> {
    // Use the collection's auth manager if the caller wants to filter by auth but didn't supply one.
    if (filter?.auth === true && this.#auth) filter = { ...filter, auth: this.#auth }
    const [models, custom] = await Promise.all([
      loadCatalog().then((c) => c.list(filter)),
      filterModels(await this.#registeredSpecs(), { ...filter, auth: undefined }),
    ])
    for (const m of Object.values(custom)) models[m.id] = m
    return Object.values(models)
  }
}

export function modelCollection(opts: ModelCtx = {}): ModelCollection {
  return new ModelCollection(opts)
}
