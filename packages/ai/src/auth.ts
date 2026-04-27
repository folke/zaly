import type { ModelSpec } from "./types.ts"

/**
 * Auth-related primitives. Centralises credential resolution so
 * everything that needs to know "can this model actually be reached"
 * — `loadModel`, `listModels({ auth })`, `filterModel` — consults a
 * single interface.
 *
 * v0 ships only the env-var reader. OAuth-based providers
 * (`codexAuth`, `copilotAuth`, …) land here as they're implemented.
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

/** Default provider — reads `process.env`. Walks `providerInfo.env`
 *  in order, first non-empty value wins. Returns `undefined` when no
 *  env var is set; callers treat that as "not available". */
export const envAuth: AuthProvider = {
  getAuth(model) {
    const envs = model.providerInfo?.env ?? []
    for (const name of envs) {
      const value = process.env[name]
      if (value !== undefined && value !== "") return { apiKey: value }
    }
    return undefined
  },
}

/** Compose multiple auth providers into one. Tried in order; the
 *  first to return credentials wins. Useful for "try my Codex session,
 *  fall back to OPENAI_API_KEY" flows:
 *
 *  ```ts
 *  const auth = chainAuth(codexAuth, envAuth)
 *  const model = await loadModel("openai/gpt-5", undefined, auth)
 *  ```
 */
export function chainAuth(...providers: AuthProvider[]): AuthProvider {
  return {
    async getAuth(model) {
      for (const p of providers) {
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

/** Whether `auth` can resolve credentials for this model. Shorthand
 *  for `(await auth.getAuth(m)) !== undefined`. Default auth is
 *  `envAuth` (process.env reader), so the common case stays:
 *
 *  ```ts
 *  await isAvailable(m)                     // env-available?
 *  await isAvailable(m, chainAuth(codex, env))
 *  ```
 */
export async function hasAuth(m: ModelSpec, auth: AuthProvider = envAuth): Promise<boolean> {
  return (await auth.getAuth(m)) !== undefined
}
