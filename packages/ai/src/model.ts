import type { AuthProvider } from "./auth.ts"
import type {
  Context,
  Provider,
  StreamEvent,
  StreamOptions,
  TokenCount,
  Usage,
} from "./provider.ts"
import type { AnyProvider } from "./providers/index.ts"
import type { Cost, ModelSpec, ProviderOptions } from "./types.ts"

import { envAuth } from "./auth.ts"
import { getModel } from "./models.ts"
import { loadProvider } from "./providers/index.ts"

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

  constructor(opts: { id: string; spec: ModelSpec; provider: Provider<T> }) {
    this.id = opts.id
    this.spec = opts.spec
    this.provider = opts.provider
  }

  /** Stream a turn against this model. Returns the underlying
   *  provider stream; if the model has catalog cost data, `finish`
   *  events get a populated `usage.cost` breakdown. */
  stream(ctx: Context, opts: StreamOptions = {}): AsyncIterable<StreamEvent> {
    const inner = this.provider.stream({
      ctx,
      model: this.spec.id,
      opts,
      quirks: this.spec.quirks,
    })
    return this.spec.cost ? this.#augment(inner) : inner
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
  const provider = await loadProvider(spec.provider, {
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
 *  `input` here is the *uncached* portion, since the cached portion is
 *  billed at `cacheRead` rate. We derive uncached as
 *  `usage.input − cacheRead − cacheWrite` to avoid double-counting. */
function computeCost(usage: Usage, prices: Cost): TokenCount {
  const cacheRead = usage.cacheRead ?? 0
  const cacheWrite = usage.cacheWrite ?? 0
  const uncachedInput = Math.max(0, usage.input - cacheRead - cacheWrite)
  const M = 1_000_000
  const cost: TokenCount = {
    input: (uncachedInput * prices.input) / M,
    output: (usage.output * prices.output) / M,
  }
  if (cacheRead > 0) cost.cacheRead = (cacheRead * (prices.cache_read ?? prices.input)) / M
  if (cacheWrite > 0) cost.cacheWrite = (cacheWrite * (prices.cache_write ?? prices.input)) / M
  if (usage.reasoning !== undefined && prices.reasoning !== undefined) {
    cost.reasoning = (usage.reasoning * prices.reasoning) / M
  }
  return cost
}
