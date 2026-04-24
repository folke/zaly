import type { AuthProvider } from "./auth.ts"
import type {
  CountRequest,
  GenerateRequest,
  Provider,
  StreamEvent,
  TokenCount,
} from "./provider.ts"
import type { BuiltinProvider } from "./providers/index.ts"
import type { ModelOptions, ProviderOptions } from "./types.ts"

import { envAuth } from "./auth.ts"
import { getModel } from "./models.ts"
import { loadProvider } from "./providers/index.ts"

/** Shape of a loaded model. `stream` / `countTokens` are the same as
 *  the underlying `Provider` but with `model` pre-filled and quirks
 *  auto-attached, so callers don't repeat themselves every turn.
 *
 *  `provider` is exposed for power-user reuse — a long-running app
 *  with many models on the same endpoint can share the same adapter
 *  instance (and therefore the same fetch / retry / connection pool)
 *  by constructing it once and passing it via `options.fetch`. */
export interface Model<T extends BuiltinProvider = BuiltinProvider> {
  id: string
  options: ModelOptions
  provider: Provider<T>
  stream(req: Omit<GenerateRequest, "model">): AsyncIterable<StreamEvent>
  countTokens?(req: Omit<CountRequest, "model">): Promise<TokenCount>
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

  return {
    id,
    options,
    provider,
    stream(req) {
      return provider.stream({ ...req, model: options.id, quirks: req.quirks ?? options.quirks })
    },
    ...(provider.countTokens
      ? {
          async countTokens(req) {
            return await provider.countTokens!({ ...req, model: options.id })
          },
        }
      : {}),
  }
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
async function buildAdapter(
  options: ModelOptions,
  auth: AuthProvider
): Promise<Provider<BuiltinProvider>> {
  const creds = await auth.getAuth(options)
  return await loadProvider(options.provider as BuiltinProvider, {
    ...options,
    apiKey: options.apiKey ?? creds?.apiKey,
    headers: { ...creds?.headers, ...options.headers },
  })
}
