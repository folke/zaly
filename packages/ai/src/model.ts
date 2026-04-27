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
import type { Cost, ModelOptions, ProviderOptions } from "./types.ts"

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
  readonly options: ModelOptions
  readonly provider: Provider<T>

  constructor(args: { id: string; options: ModelOptions; provider: Provider<T> }) {
    this.id = args.id
    this.options = args.options
    this.provider = args.provider
  }

  /** Stream a turn against this model. Returns the underlying
   *  provider stream; if the model has catalog cost data, `finish`
   *  events get a populated `usage.cost` breakdown. */
  stream(ctx: Context, opts: StreamOptions = {}): AsyncIterable<StreamEvent> {
    const inner = this.provider.stream({
      ctx,
      model: this.options.id,
      opts,
      quirks: this.options.quirks,
    })
    return this.options.cost ? augmentUsage(inner, this.options.cost) : inner
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
  source: string | ModelOptions,
  overrides?: Partial<ProviderOptions>,
  auth: AuthProvider = envAuth
): Promise<Model> {
  const base: ModelOptions = typeof source === "string" ? await resolve(source) : source
  const options: ModelOptions = { ...base, ...overrides }
  const provider = await buildAdapter(options, auth)
  // URI form — preserve the caller's id when they passed a string (so
  // catalog lookups round-trip `"openrouter/kimi/k2"` even though
  // `options.provider` now holds the adapter name `"openai"`). For
  // in-memory ModelOptions, synthesise from providerInfo.id (endpoint
  // name) with `options.provider` as a fallback when providerInfo is
  // absent.
  const id =
    typeof source === "string"
      ? source
      : `${options.providerInfo?.id ?? options.provider}/${options.id}`

  return new Model({ id, options, provider })
}

/** Wrap a provider's stream so the `finish` event's `usage` carries
 *  computed `cost`. All other events pass through unchanged. */
async function* augmentUsage(
  stream: AsyncIterable<StreamEvent>,
  prices: Cost
): AsyncIterable<StreamEvent> {
  for await (const ev of stream) {
    yield ev.type === "finish"
      ? { ...ev, usage: { ...ev.usage, cost: computeCost(ev.usage, prices) } }
      : ev
  }
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

async function resolve(id: string): Promise<ModelOptions> {
  const opts = await getModel(id)
  if (opts === undefined) {
    throw new Error(
      `Unknown model "${id}". Use \`addModels({ "${id}": { … } })\` to register a custom one.`
    )
  }
  return opts
}

/** Construct the adapter for a pre-resolved `ModelOptions`. Everything
 *  about HOW to reach the endpoint is already on `options` (baseUrl,
 *  headers, quirks); `auth` resolves credentials.
 *
 *  Options spread in full rather than field-by-field: any future
 *  `ProviderOptions` extension (timeout, proxy, etc.) flows through
 *  automatically. `apiKey` and `headers` from the caller's options
 *  win over auth-resolved values. */
async function buildAdapter(options: ModelOptions, auth: AuthProvider): Promise<Provider> {
  const creds = await auth.getAuth(options)
  return await loadProvider(options.provider, {
    ...options,
    apiKey: options.apiKey ?? creds?.apiKey,
    headers: { ...creds?.headers, ...options.headers },
  })
}
