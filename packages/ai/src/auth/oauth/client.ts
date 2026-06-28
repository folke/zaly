// oxlint-disable no-await-in-loop
import type { ApiKey } from "../manager.ts"
import type {
  OAuthTokens,
  OAuthDeviceCodeResponse,
  OAuthLogin,
  OAuthMethod,
  OAuthOptions,
  OAuthTokenResponse,
} from "./types.ts"

const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code"

export function defaultOAuthCredentials(response: OAuthTokenResponse): OAuthTokens {
  if (typeof response.access_token !== "string")
    throw new Error("OAuth token response missing access_token")
  return {
    access: response.access_token,
    expires:
      typeof response.expires_in === "number" ? Date.now() + response.expires_in * 1000 : Infinity,
    refresh: typeof response.refresh_token === "string" ? response.refresh_token : undefined,
  }
}

export class OAuth {
  readonly id: string
  readonly name: string
  readonly #opts: OAuthOptions

  constructor(opts: OAuthOptions) {
    if (!opts.authorizeUrl && !opts.deviceUrl) {
      throw new Error(`OAuth ${opts.id} needs at least one login flow`)
    }
    this.#opts = opts
    this.id = opts.id
    this.name = opts.name ?? opts.id
  }

  get methods(): OAuthMethod[] {
    return [
      this.#opts.authorizeUrl ? "browser" : undefined,
      this.#opts.deviceUrl ? "device" : undefined,
    ].filter((m): m is OAuthMethod => m !== undefined)
  }

  async login(opts: OAuthLogin = {}): Promise<OAuthTokens> {
    const methods = this.methods
    if (methods.length === 0) throw new Error(`OAuth ${this.id} has no login methods`)
    const method: OAuthMethod = opts.method ?? methods[0]
    if (!methods.includes(method))
      throw new Error(`OAuth ${this.id} does not support login method ${method}`)
    return method === "browser" ? await this.#browser(opts) : await this.#device(opts)
  }

  async refresh(refresh: string): Promise<OAuthTokens> {
    return await this.#credentials(
      await request(this.#opts.tokenUrl, {
        client_id: this.#opts.clientId,
        grant_type: "refresh_token",
        refresh_token: refresh,
      })
    )
  }

  async apiKey(tokens: OAuthTokens): Promise<ApiKey> {
    return this.#opts.toApiKey?.(tokens) ?? { key: tokens.access, source: "oauth" }
  }

  async #browser(opts: OAuthLogin): Promise<OAuthTokens> {
    if (!this.#opts.authorizeUrl) throw new Error(`OAuth ${this.id} does not support browser login`)

    const { generatePkce } = await import("./utils.ts")
    const { challenge, verifier } = await generatePkce()
    const state = randomState()
    const redirectUri = this.#opts.redirectUri
    const url = new URL(this.#opts.authorizeUrl)
    url.searchParams.set("response_type", "code")
    url.searchParams.set("client_id", this.#opts.clientId)
    url.searchParams.set("redirect_uri", redirectUri)
    url.searchParams.set("scope", this.#opts.scope)
    url.searchParams.set("code_challenge", challenge)
    url.searchParams.set("code_challenge_method", "S256")
    url.searchParams.set("state", state)
    for (const [key, value] of Object.entries(this.#opts.authorizeParams ?? {})) {
      url.searchParams.set(key, value)
    }

    await opts.onUrl?.({
      instructions: `Open this URL to authorize ${this.name}.`,
      url: url.toString(),
    })

    const { captureCode } = await import("./server.ts")

    const code = await captureCode({
      ...opts,
      provider: this.name,
      redirectUri,
      state,
    })

    return await this.#credentials(
      await request<OAuthTokenResponse>(this.#opts.tokenUrl, {
        client_id: this.#opts.clientId,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      })
    )
  }

  async #device(opts: OAuthLogin): Promise<OAuthTokens> {
    if (!this.#opts.deviceUrl) throw new Error(`OAuth ${this.id} does not support device login`)

    const device = await request<OAuthDeviceCodeResponse>(this.#opts.deviceUrl, {
      client_id: this.#opts.clientId,
      scope: this.#opts.scope,
    })
    const verificationUrl = device.verification_uri ?? device.verification_url
    const verificationUrlComplete =
      device.verification_uri_complete ?? device.verification_url_complete
    if (!device.device_code || !device.user_code || !verificationUrl || !device.expires_in) {
      throw new Error(
        `OAuth ${this.id} device-code response missing fields: ${JSON.stringify(device)}`
      )
    }
    const interval = device.interval ?? 5
    await opts.onDeviceCode?.({
      expiresIn: device.expires_in,
      interval,
      userCode: device.user_code,
      verificationUrl,
      verificationUrlComplete,
    })
    if (!opts.onDeviceCode) {
      await opts.onUrl?.({
        instructions: `Open this URL and enter code \`${device.user_code}\` to authorize ${this.name}.`,
        url: verificationUrlComplete ?? verificationUrl,
      })
    }
    return await this.#credentials(await this.#pollDevice(device.device_code, interval, opts))
  }

  async #pollDevice(
    deviceCode: string,
    interval: number,
    opts: OAuthLogin
  ): Promise<OAuthTokenResponse> {
    let delay = interval * 1000
    while (!opts.signal?.aborted) {
      await sleep(delay, opts.signal)
      const response = await fetch(this.#opts.tokenUrl, {
        body: new URLSearchParams({
          client_id: this.#opts.clientId,
          device_code: deviceCode,
          grant_type: DEVICE_GRANT,
        }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      })
      const json = (await response.json().catch(() => ({}))) as OAuthTokenResponse & {
        error?: string
      }
      if (response.ok) return json
      if (json.error === "authorization_pending") continue
      if (json.error === "slow_down") {
        delay += 5000
        continue
      }
      throw new Error(`OAuth ${this.id} device login failed: ${json.error ?? response.status}`)
    }
    throw new Error(`OAuth ${this.id} device login aborted`)
  }

  async #credentials(response: OAuthTokenResponse): Promise<OAuthTokens> {
    const toCredentials = this.#opts.toTokens ?? defaultOAuthCredentials
    return await toCredentials(response)
  }
}

async function request<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    body: new URLSearchParams(body),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  })
  const json = (await response.json().catch(() => ({}))) as T
  if (!response.ok)
    throw new Error(
      `OAuth request for \`${url}\` failed (${response.status}): ${JSON.stringify(json)}`
    )
  return json
}

function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new Error("Login aborted"))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new Error("Login aborted"))
      },
      { once: true }
    )
  })
}
