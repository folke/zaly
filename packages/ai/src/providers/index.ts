import type { Provider } from "../provider.ts"
import type { ProviderOptions } from "../types.ts"

type ProviderLoader<T extends string = string> = (opts: ProviderOptions) => Promise<Provider<T>>

export const providers = {
  openai: (opts) => import("./openai.ts").then((m) => m.createOpenAI(opts)),
} as const satisfies Record<string, ProviderLoader>

export type BuiltinProvider = keyof typeof providers

export async function loadProvider<T extends BuiltinProvider>(
  name: BuiltinProvider,
  opts: ProviderOptions
): Promise<Provider<T>> {
  const loader = providers[name] as ProviderLoader<T>
  return await loader(opts)
}
