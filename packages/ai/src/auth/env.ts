import type { AuthProvider } from "./auth.ts"

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
