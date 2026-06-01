import type { AuthProvider } from "./auth.ts"

/** Default provider — reads `process.env`. Walks `providerInfo.env`
 *  in order, first non-empty value wins. Returns `undefined` when no
 *  env var is set; callers treat that as "not available". */
export const envAuth: AuthProvider = {
  getAuth(model) {
    const apiKey = model.apiKey
    if (apiKey) {
      const m = apiKey.match(/^(?:\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*))$/)
      if (!m) return undefined // literal apiKey: don't override it
      const name = m[1] || m[2]
      const value = process.env[name]
      return value ? { apiKey: value } : undefined
    }
    const envs = model.env ?? []
    for (const name of envs) {
      const value = process.env[name]
      if (value !== undefined && value !== "") return { apiKey: value }
    }
    return undefined
  },
}
