import type { JsonFile } from "@zaly/shared/json"
import type { Logger } from "@zaly/shared/logger"
import type { ContentTransform } from "./content/transform.ts"
import type { ModelCatalog } from "./models/catalog.ts"
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
  ModelsJson,
  ModelSpec,
  ProviderOverride,
} from "./types.ts"

import { prettyPath } from "@zaly/shared"
import { BaseCollection } from "@zaly/shared/collection"
import { AuthManager } from "./auth/manager.ts"
import { attachmentToMeta } from "./content/compose.ts"
import { createTransform } from "./content/transform.ts"
import { getModel, loadCatalog } from "./models/catalog.ts"
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
  json?: JsonFile<ModelsJson, ModelsJson>
}

class ModelCollection extends BaseCollection<
  Model | undefined,
  Promise<ModelSpec[]>,
  ProviderOverride
> {
  #auth?: AuthManager
  #logger?: Logger
  #catalog?: ModelCatalog
  #json?: JsonFile<ModelsJson, ModelsJson>

  constructor(opts: ModelCtx = {}) {
    super(undefined)
    this.#auth = opts.auth
    this.#logger = opts.logger
    this.#json = opts.json
    this.on("register", () => this.refresh())
    this.on("unregister", () => this.refresh())
  }

  async catalog() {
    if (this.#catalog) return this.#catalog
    const overrides = [...this.registered]
    if (this.#json) {
      try {
        await this.#json.refresh()
        for (const [pid, p] of Object.entries(this.#json.$))
          overrides.push({ id: pid, ...p, source: "models.json" })
      } catch (error) {
        const path = prettyPath(this.#json.path)
        this.#logger?.error(`Failed to refresh \`${path}\`:`, error)
      }
    }
    const cat = await loadCatalog()
    this.#catalog = await cat.fork(overrides, { logger: this.#logger })
    return this.#catalog
  }

  refresh(): void {
    this.#catalog = undefined
  }

  async providers(): Promise<readonly ModelProvider<true>[]> {
    const cat = await this.catalog()
    return cat.providers
  }

  async get(id: string): Promise<ModelSpec | undefined> {
    const cat = await this.catalog()
    return cat.get(id)
  }

  async load(opts: ModelOpts): Promise<Model> {
    const id = typeof opts === "string" ? opts : opts.id
    return loadModel(opts, await this.get(id), { auth: this.#auth, logger: this.#logger })
  }

  async list(filter?: ModelFilter): Promise<ModelSpec[]> {
    const cat = await this.catalog()
    // Apply our auth manager if auth filtering is requested
    return cat.list({ ...filter, auth: filter?.auth ? this.#auth : undefined })
  }

  override register(provider: ProviderOverride): () => void {
    return super.register({ ...provider, source: "custom" })
  }
}

export function modelCollection(opts: ModelCtx = {}): ModelCollection {
  return new ModelCollection(opts)
}
