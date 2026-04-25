import type { Provider } from "../provider.ts"
import type { ProviderOptions } from "../types.ts"

export type ProviderLoader<T extends string = string> = (
  opts: ProviderOptions
) => Promise<Provider<T>>

/** Built-in adapter families. Keyed by adapter name so `keyof` gives
 *  the `BuiltinProvider` union for free. `satisfies` preserves literal
 *  keys — widening to `Record<string, ProviderLoader>` would erase
 *  them and lose the typed autocomplete. */
export const providers = {
  anthropic: (opts) => import("./anthropic.ts").then((m) => m.createAnthropic(opts)),
  openai: (opts) => import("./openai.ts").then((m) => m.createOpenAI(opts)),
} as const satisfies Record<string, ProviderLoader>

export type BuiltinProvider = keyof typeof providers

/** Runtime-registered adapters. Parallel with `customModels` /
 *  `addModels`: lets third-party packages register their own adapter
 *  families without recompiling the core. Registrations take
 *  precedence over built-ins with the same name, so a user can also
 *  swap in a customised drop-in replacement (e.g. a proxied
 *  `createOpenAI` with extra instrumentation). */
const customAdapters = new Map<string, ProviderLoader>()

/** Register an adapter at runtime. Idempotent per key — calling twice
 *  with the same name replaces the previous entry. Typed generically
 *  so the loader's `Provider<T>` return narrows to the caller's
 *  specified id string:
 *
 *  ```ts
 *  registerAdapter("my-proxy", async (opts) => ({
 *    id: "my-proxy",
 *    async *stream(req) { … },
 *  }))
 *  ```
 */
export function registerAdapter<T extends string>(
  name: T,
  loader: ProviderLoader<T>
): void {
  customAdapters.set(name, loader as ProviderLoader)
}

/** Resolve an adapter by name. Custom registrations win over
 *  built-ins; unknown names throw with the current registry listing
 *  for debuggability. */
export async function loadProvider<T extends BuiltinProvider>(
  name: BuiltinProvider,
  opts: ProviderOptions
): Promise<Provider<T>>
export async function loadProvider(name: string, opts: ProviderOptions): Promise<Provider>
export async function loadProvider(name: string, opts: ProviderOptions): Promise<Provider> {
  const custom = customAdapters.get(name)
  if (custom !== undefined) return await custom(opts)
  const builtin = (providers as Record<string, ProviderLoader | undefined>)[name]
  if (builtin !== undefined) return await builtin(opts)
  const known = [...customAdapters.keys(), ...Object.keys(providers)].toSorted().join(", ")
  throw new Error(`Unknown adapter "${name}". Registered: ${known}.`)
}
