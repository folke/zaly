import type { MaybePromise } from "@zaly/shared"
import type { JsonFile } from "@zaly/shared/json"
import type { Logger } from "@zaly/shared/logger"
import type { ModelSpec, ModelProvider, ProviderOptions } from "../types.ts"
import type { OAuthCallbacks, OAuthLogin, OAuthOptions, OAuthTokens } from "./oauth/types.ts"

import { loadJsonFile } from "@zaly/shared/json"

type StoredApiKey = Omit<ApiKey, "source">

export type ApiKeySecret = {
  type: "api-key"
} & StoredApiKey
export type OAuthSecret = {
  type: "oauth"
  tokens: OAuthTokens
} & StoredApiKey
export type AuthSecret = ApiKeySecret | OAuthSecret
export type AuthSecrets = Record<string, AuthSecret>

export type AuthSource = "store" | "env" | "oauth" | "model"

export type ApiKey = {
  key: string
  source: AuthSource
  headers?: Record<string, string>
}

export type AuthLoginMethod = "api-key" | "oauth-browser" | "oauth-device" | "env"
export type AuthLogin = {
  method: AuthLoginMethod
  desc: string
  login: () => Promise<ApiKey>
}

export type LoginCallbacks = OAuthCallbacks

export type AuthManagerOpts = {
  logger?: Logger
  /** Resolve bash commands in secrets:
   * - `true`: Use the system default bash shell.
   * - `false`: Disable bash resolving.
   * - `string[]`: Use a custom bash shell with the provided arguments. */
  bash?: boolean | string[]
  /** Whether to resolve environment variables in secrets. Defaults to `true`. */
  env?: boolean
}

const REFRESH_LEEWAY_MS = 60_000

export async function resolveApiKey(key: ProviderOptions["apiKey"]): Promise<ApiKey | undefined> {
  const ret = typeof key === "function" ? await key() : key
  return typeof ret === "string" ? { key: ret, source: "model" } : ret
}

export class AuthManager {
  #opts: AuthManagerOpts
  #json?: JsonFile<AuthSecrets, AuthSecrets>
  #bashCache = new Map<string, string>()
  #serialized: Record<string, Promise<unknown>> = {}
  static #basic?: AuthManager

  private constructor(json?: JsonFile<AuthSecrets, AuthSecrets>, opts: AuthManagerOpts = {}) {
    this.#opts = opts
    this.#json = json
  }

  /** Create an AuthManager that only resolves environment variables, no JSON store. */
  static basic(): AuthManager {
    return (AuthManager.#basic ??= new AuthManager(undefined, { bash: false, env: true }))
  }

  static async load(path: string, opts: AuthManagerOpts = {}): Promise<AuthManager> {
    const json = await loadJsonFile<AuthSecrets, AuthSecrets>(path, { default: {} })
    return new AuthManager(json, opts)
  }

  // FIXME: should work on provider
  async getAuth(model: ModelSpec): Promise<ApiKey | undefined> {
    if (model.apiKey) {
      const key = await resolveApiKey(model.apiKey)
      if (key) return { key: await this.resolve(key.key), source: "model" }
    }

    const provider = model.provider.id

    const secret = this.get(provider)
    if (secret?.type === "api-key")
      return { ...secret, key: await this.resolve(secret.key), source: "store" }

    if (secret?.type === "oauth") {
      const ret = await this.#serialize(provider, () => this.#fromOauth(secret, model))
      if (ret) return ret
    }

    return AuthManager.fromEnv(model)
  }

  async login(provider: ModelProvider, opts: LoginCallbacks): Promise<AuthLogin[]> {
    if (!this.#json) throw new Error("AuthManager is not configured with a JSON store")

    const logins: AuthLogin[] = []
    const oauth = await this.#oauthOpts(provider)
    if (oauth?.authorizeUrl)
      logins.push({
        desc: `Login to ${provider.name} via browser`,
        login: () => this.#oauthLogin(provider, { ...opts, method: "browser" }),
        method: "oauth-browser",
      })

    if (oauth?.deviceUrl && opts.onUrl)
      logins.push({
        desc: `Login to ${provider.name} via device code`,
        login: () => this.#oauthLogin(provider, { ...opts, method: "device" }),
        method: "oauth-device",
      })
    if (opts.onPrompt)
      logins.push({
        desc: `Login to ${provider.name} via API key`,
        login: async () => {
          const key = await opts.onPrompt?.(`Enter API key for ${provider.name}:`)
          if (!key) throw new Error("API key not provided")
          await this.set(provider.id, { key, type: "api-key" })
          return { key, source: "store" }
        },
        method: "api-key",
      })
    return logins
  }

  #oauthOpts(provider?: ModelProvider): MaybePromise<OAuthOptions | undefined> {
    const oauth = provider?.oauth
    if (!oauth) return
    return typeof oauth === "function" ? oauth(provider) : oauth
  }

  async #oauthLogin(
    provider: ModelProvider,
    opts: LoginCallbacks & Pick<OAuthLogin, "method">
  ): Promise<ApiKey> {
    const oauth = await this.#oauthOpts(provider)
    if (!oauth) throw new Error(`OAuth not configured for ${provider.id}`)
    const id = provider.id
    const { OAuth } = await import("./oauth/client.ts")
    const client = new OAuth({ ...oauth, id })
    const tokens = await client.login({ logger: this.#opts.logger, ...opts })
    const apiKey = await client.apiKey(tokens)
    await this.set(id, { tokens, ...apiKey, type: "oauth" })
    return { ...apiKey, source: "oauth" }
  }

  async #serialize<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prom = (this.#serialized[id] ??= fn().finally(() => {
      delete this.#serialized[id]
    }))
    return prom as Promise<T>
  }

  async #fromOauth(secret: OAuthSecret, model: ModelSpec): Promise<ApiKey | undefined> {
    const tokens = secret.tokens
    const expired = tokens.expires - Date.now() < REFRESH_LEEWAY_MS
    if (!expired || !tokens.refresh)
      return { headers: secret.headers, key: secret.key, source: "oauth" }
    const oauth = await this.#oauthOpts(model.provider)
    if (!oauth) return
    const id = model.provider.id
    const { OAuth } = await import("./oauth/client.ts")
    const client = new OAuth({ ...oauth, id })
    const current = await client.refresh(tokens.refresh)
    const apiKey = await client.apiKey(current)
    await this.set(id, { tokens: current, ...apiKey, type: "oauth" })
    return { ...apiKey, source: "oauth" }
  }

  static async fromEnv(model: ModelSpec): Promise<ApiKey | undefined> {
    const envs = model.provider.env ?? []
    for (const name of envs) {
      const value = process.env[name]
      if (value) return { key: value, source: "env" }
    }
  }

  get logger(): Logger | undefined {
    return this.#opts.logger
  }

  get #secrets(): AuthSecrets {
    return this.#json?.$ ?? {}
  }

  get(name: string): AuthSecret | undefined {
    return this.#secrets[name]
  }

  async set(name: string, secret: AuthSecret): Promise<void> {
    if (!this.#json) throw new Error("AuthManager is not configured with a JSON store")
    await this.#json.update((prev) => ({ ...prev, [name]: secret }))
  }

  async delete(name: string): Promise<void> {
    if (!this.#json) throw new Error("AuthManager is not configured with a JSON store")
    await this.#json.update((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  async resolve(secret: string): Promise<string> {
    secret = secret.trim()
    if (this.#opts.env !== false) {
      const m = secret.match(/^(?:\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*))$/)
      if (m) {
        const name = m[1] || m[2]
        const value = process.env[name]
        if (!value) throw new Error(`Environment variable \`$${name}\` is not set`)
        return value
      }
    }
    if (this.#opts.bash !== false && secret.startsWith("!")) {
      let value = this.#bashCache.get(secret)
      if (value) return value
      value = await this.#serialize(secret, async () => {
        const { spawnCmd } = await import("@zaly/shared/process")
        const r = await spawnCmd(secret.slice(1), {
          bash: this.#opts.bash ?? true,
          throw: true,
        })
        return r?.trim() ?? ""
      })
      this.#bashCache.set(secret, value)
      return value
    }
    return secret
  }
}
