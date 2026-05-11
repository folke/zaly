import type { Provider } from "../provider.ts"
import type { ProviderOptions } from "../types.ts"

import { createRegistry } from "@zaly/shared/registry"

export type ProviderLoader<T extends string = string> = (
  opts: ProviderOptions
) => Promise<Provider<T>>

/** Built-in adapter families. Keyed by adapter name so `keyof` gives
 *  the `BuiltinProvider` union for free. `satisfies` preserves literal
 *  keys — widening to `Record<string, ProviderLoader>` would erase
 *  them and lose the typed autocomplete. */
const providers = {
  anthropic: (opts) => import("./anthropic.ts").then((m) => m.createAnthropic(opts)),
  openai: (opts) => import("./openai.ts").then((m) => m.createOpenAI(opts)),
  "openai-responses": (opts) =>
    import("./openai-responses.ts").then((m) => m.createOpenAIResponses(opts)),
} as const satisfies Record<string, ProviderLoader>

export type BuiltinProvider = keyof typeof providers
export type AnyProvider = BuiltinProvider | (string & {})

export const providerRegistry = createRegistry<Promise<Provider>, ProviderOptions>("provider").from(
  providers
)
