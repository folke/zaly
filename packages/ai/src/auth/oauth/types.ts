import type { MaybePromise } from "@zaly/shared"
import type { Logger } from "@zaly/shared/logger"
import type { ApiKey } from "../manager.ts"

export type OAuthMethod = "browser" | "device"

export type OAuthTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
  [key: string]: unknown
}

export type OAuthTokens = {
  access: string
  refresh?: string
  /** Wall-clock ms epoch the access token expires at. */
  expires: number
}

export type OAuthCallbacks = {
  /** Called when a browser URL is ready. */
  onUrl?: (info: { url: string; instructions: string }) => MaybePromise
  /** Called when a device-code flow is ready for user action. */
  onDeviceCode?: (info: {
    userCode: string
    verificationUrl: string
    verificationUrlComplete?: string
    expiresIn: number
    interval: number
  }) => MaybePromise
  /** Optional manual paste fallback for browser flows. */
  onPrompt?: (msg: string) => Promise<string>
  /** Abort the in-flight login. */
  signal?: AbortSignal
}

export type OAuthLogin = OAuthCallbacks & {
  method?: OAuthMethod
  logger?: Logger
}

export type OAuthDeviceCodeResponse = {
  device_code?: string
  user_code?: string
  verification_uri?: string
  verification_url?: string
  verification_uri_complete?: string
  verification_url_complete?: string
  expires_in?: number
  interval?: number
  [key: string]: unknown
}

export type OAuthOptions = {
  id: string
  name?: string
  clientId: string
  tokenUrl: string
  scope: string

  /** Browser/PKCE authorization endpoint. Enables `method: "browser"`. */
  authorizeUrl?: string
  authorizeParams?: Record<string, string>
  redirectUri: string

  /** Device-code endpoint. Enables `method: "device"`. */
  deviceUrl?: string

  /** Convert a raw OAuth token response to provider-specific credentials. */
  toTokens?: (response: OAuthTokenResponse) => MaybePromise<OAuthTokens>
  toApiKey?: (creds: OAuthTokens) => ApiKey
}
