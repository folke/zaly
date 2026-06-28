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

export type AuthSource = "store" | "env" | "oauth" | "model" | "provider"

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

/** Resolve an API key from a string, function, or object.
 * This does NOT resolve env vars or bash commands; use `AuthManager.resolve` for that. */
export async function resolveApiKey(
  key: ProviderOptions["apiKey"],
  source: AuthSource = "model"
): Promise<ApiKey | undefined> {
  const ret = typeof key === "function" ? await key() : key
  if (!ret) return
  return typeof ret === "string"
    ? { key: ret, source }
    : { headers: ret.headers, key: ret.key, source }
}

function isProvider(it: ModelProvider | ModelSpec): it is ModelProvider {
  return (it as { models: unknown }).models !== undefined
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

  /** Check if a provider requires authentication (via OAuth, API key, or env vars). */
  needAuth(provider: ModelProvider): boolean {
    return !!(provider.oauth ?? provider.apiKey ?? provider.env?.length)
  }

  async getAuth(it: ModelSpec | ModelProvider): Promise<ApiKey | undefined> {
    const provider = isProvider(it) ? it : it.provider
    const model = isProvider(it) ? undefined : it

    // 1. Explicit apiKey has been set for the model. (typically coming from --api-key)
    if (model?.apiKey) {
      let ret = await resolveApiKey(model.apiKey, "model")
      ret = await this.#resolve(ret, provider)
      if (ret) return ret
    }

    // 2. api-key from the store
    const secret = this.get(provider.id)
    if (secret?.type === "api-key") {
      const ret = await this.#resolve({ ...secret, source: "store" }, provider)
      if (ret) return ret
    }

    // 3. oauth from the store
    if (secret?.type === "oauth") {
      const ret = await this.#serialize(provider.id, () => this.#fromOauth(secret, provider))
      if (ret) return ret
    }

    // 4. apiKey from the model provider (typically with env vars)
    if (provider.apiKey) {
      let ret = await resolveApiKey(provider.apiKey, "provider")
      ret = await this.#resolve(ret, provider)
      if (ret) return ret
    }

    // 5. any env vars configured for the provider
    return this.#fromEnv(provider)
  }

  /** Return a list of available login methods for the provider, including OAuth and API key. */
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

  /** Perform an OAuth login flow and store the resulting tokens in the JSON store. */
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

  /** Serialize a promise by ID, so that concurrent calls with the same ID will share the same promise. */
  async #serialize<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prom = (this.#serialized[id] ??= fn().finally(() => {
      delete this.#serialized[id]
    }))
    return prom as Promise<T>
  }

  /** Attempt to refresh an OAuth token if it is expired, and return the ApiKey. */
  async #fromOauth(secret: OAuthSecret, provider: ModelProvider): Promise<ApiKey | undefined> {
    const tokens = secret.tokens
    const expired = tokens.expires - Date.now() < REFRESH_LEEWAY_MS
    if (!expired || !tokens.refresh)
      return { headers: secret.headers, key: secret.key, source: "oauth" }
    const oauth = await this.#oauthOpts(provider)
    if (!oauth) return
    const id = provider.id
    const { OAuth } = await import("./oauth/client.ts")
    const client = new OAuth({ ...oauth, id })
    const current = await client.refresh(tokens.refresh)
    const apiKey = await client.apiKey(current)
    await this.set(id, { tokens: current, ...apiKey, type: "oauth" })
    return { ...apiKey, source: "oauth" }
  }

  /** Check for any configured environment variables for the provider and return the first one that is set. */
  async #fromEnv(provider: ModelProvider): Promise<ApiKey | undefined> {
    const envs = provider.env ?? []
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

  /** Resolve an ApiKey object, replacing env vars and executing bash commands if configured. */
  async #resolve(apiKey: ApiKey | undefined, provider: ModelProvider): Promise<ApiKey | undefined> {
    if (!apiKey) return
    const key = await this.resolve(apiKey.key, provider)
    if (!key) return
    return { headers: apiKey.headers, key, source: apiKey.source }
  }

  /** Resolve a secret string, replacing env vars and executing bash commands if configured. */
  async resolve(secret: string, provider: ModelProvider): Promise<string | undefined> {
    secret = secret.trim()
    if (this.#opts.env !== false) {
      const missing: string[] = []
      const value = secret.replace(
        /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, braced, bare) => {
          const name = braced ?? bare
          const res = process.env[name]
          if (res === undefined) missing.push(name)
          return res ?? match
        }
      )
      if (missing.length) {
        this.logger?.warn(
          `Missing env API key \`${secret}\` for **${provider.name}**:\n- ${missing.join("\n- ")}`
        )
        return
      }
      return value
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
      if (value === "") {
        this.logger?.warn(`Empty bash API key \`${secret}\` for **${provider.name}**`)
        return
      }
      this.#bashCache.set(secret, value)
      return value
    }
    return secret
  }
}
