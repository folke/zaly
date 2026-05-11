import type { ModelSpec } from "../types.ts"

import { createRegistry } from "@zaly/shared/registry"

/**
 * Auth-related primitives. Centralises credential resolution so
 * everything that needs to know "can this model actually be reached"
 * — `loadModel`, `listModels({ auth })`, `filterModel` — consults a
 * single interface.
 *
 * Built-in adapters are registered in `authProviders` and lazy-loaded
 * via `providerRegistry`; consumers reference them by name (`"codex"`,
 * `"env"`) or pass an `AuthProvider` object directly to `chainAuth`.
 */

/** Credentials resolved for one model. Flat on purpose — adapters
 *  apply `apiKey` via the `Authorization: Bearer` convention when
 *  present, and merge `headers` onto the outbound request. Most
 *  providers touch only `apiKey`; schemes with multiple auth headers
 *  (Copilot, Vertex JWT) use `headers`. */
export interface AuthCredentials {
  apiKey?: string
  headers?: Record<string, string>
}

/** Resolves credentials for a given model. Returning `undefined`
 *  signals "not my concern" — in a chain, the next provider is
 *  tried. Async because OAuth providers need to read files / refresh
 *  tokens; the default env reader completes synchronously (Promise
 *  wrapping is negligible overhead). */
export interface AuthProvider {
  getAuth(model: ModelSpec): AuthCredentials | undefined | Promise<AuthCredentials | undefined>
}

/** Built-in adapter families. Keyed by adapter name so `keyof` gives
 *  the `BuiltinProvider` union for free. `satisfies` preserves literal
 *  keys — widening to `Record<string, ProviderLoader>` would erase
 *  them and lose the typed autocomplete. */
const authProviders = {
  codex: () => import("./openai-codex.ts").then((m) => m.codexAuth),
  env: () => import("./env.ts").then((m) => m.envAuth),
} as const satisfies Record<string, () => Promise<AuthProvider>>

export type BuiltinAuthProvider = keyof typeof authProviders
export type AnyAuthProvider = BuiltinAuthProvider | (string & {})

export const providerRegistry = createRegistry<Promise<AuthProvider>>("auth").from(authProviders)

/** Compose multiple auth providers into one. Tried in order; the
 *  first to return credentials wins. Useful for "try my Codex session,
 *  fall back to OPENAI_API_KEY" flows:
 *
 *  ```ts
 *  const auth = chainAuth(codexAuth, envAuth)
 *  const model = await loadModel("openai/gpt-5", undefined, auth)
 *  ```
 */
export function chainAuth(...providers: (AuthProvider | AnyAuthProvider)[]): AuthProvider {
  let resolved: AuthProvider[] | undefined
  return {
    async getAuth(model) {
      resolved ??= await Promise.all(
        providers.map((p) =>
          typeof p === "string" ? providerRegistry.load(p) : Promise.resolve(p)
        )
      )
      for (const p of resolved) {
        // Intentionally sequential: first-wins semantics. Running in
        // parallel would fire all auth checks even after a hit and
        // potentially trigger unwanted side effects (token refresh,
        // keychain prompts).
        // oxlint-disable-next-line no-await-in-loop
        const creds = await p.getAuth(model)
        if (creds !== undefined) return creds
      }
      return undefined
    },
  }
}

/** Resolve credentials for `model`. With no `auth` argument, builds a
 *  fresh chain of every currently-registered provider — so late-bound
 *  registrations (`providerRegistry.register("copilot", …)`) take
 *  effect on the next call, no module-reload required.
 *
 *  Pass an explicit `auth` (e.g. `chainAuth(codexAuth, envAuth)` or
 *  `chainAuth("env")`) when the call site wants a fixed chain
 *  independent of registry mutations.
 */
export async function authenticate(
  model: ModelSpec,
  auth?: AuthProvider
): Promise<AuthCredentials | undefined> {
  auth ??= chainAuth(...providerRegistry.keys())
  return auth.getAuth(model)
}

/** Whether `auth` can resolve credentials for this model. Shorthand
 *  for `(await authenticate(m, auth)) !== undefined`. With no `auth`
 *  argument, every currently-registered built-in provider is tried in
 *  registration order (currently `codex` then `env`), so OAuth-session
 *  credentials win over env-var credentials when both are present.
 *
 *  ```ts
 *  await hasAuth(m)                                 // default chain
 *  await hasAuth(m, chainAuth("env"))               // env-only
 *  await hasAuth(m, chainAuth(codexAuth, envAuth))  // explicit objects
 *  ```
 */
export async function hasAuth(m: ModelSpec, auth?: AuthProvider): Promise<boolean> {
  return (await authenticate(m, auth)) !== undefined
}
