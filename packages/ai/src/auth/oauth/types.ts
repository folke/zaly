import type { MaybePromise } from "@zaly/shared"
import type { Logger } from "@zaly/shared/logger"
import type { ApiKey } from "../manager.ts"
import type { safeFetch } from "./utils.ts"

export type OAuthMethod = "browser" | "device"

export type OAuthTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export type OAuthToken = {
  access: string
  refresh?: string
  /** Wall-clock ms epoch the access token expires at. */
  expires: number
}

export type OAuthCallbacks = {
  /** Called when a browser URL is ready to open. */
  browse?: (url: string) => MaybePromise
  /** Notify with details about the login flow. */
  notify?: (opts: { title: string; details?: string }) => MaybePromise
  /** Prompt the user for input. */
  prompt?: (msg: string) => Promise<string | undefined>
  /** Called when a device-code flow is ready for user action. */
  onDeviceCode?: (opts: OAuthDeviceCode) => MaybePromise
  /** Abort the in-flight login. */
  signal?: AbortSignal
}

export type OAuthLogin = OAuthCallbacks & {
  method?: OAuthMethod
  logger?: Logger
}

export type OAuthDeviceCode = {
  deviceCode: string
  userCode: string
  verificationUrl: string
  /** Wall-clock ms epoch the device code expires at. */
  expires: number
  interval: number
}

export type OAuthOptions = OAuthProvider & {
  device?: OAuthDeviceOpts
  browser?: OAuthBrowserOpts
  apiKey: (token: OAuthToken) => MaybePromise<ApiKey>
}

export type OAuthProvider = {
  name: string
  clientId: string
  tokenUrl: string
}

export type OAuthRequest = {
  params?: Record<string, string>
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type OAuthTokenRequest = OAuthProvider & OAuthRequest

export type OAuthExchangeCodeRequest = OAuthTokenRequest & {
  code: string
  verifier: string
  redirectUrl: string
}

export type OAuthLoginCtx = OAuthLogin &
  OAuthProvider & {
    fetch: typeof safeFetch
  }

export type OAuthBrowserOpts = {
  redirectUrl: string
  authorizeUrl: string | URL
  scope: string
}

export type OAuthDeviceOpts = {
  start: (ctx: OAuthLoginCtx) => Promise<OAuthDeviceCode>
  poll: (
    device: OAuthDeviceCode,
    ctx: OAuthLoginCtx
  ) => Promise<
    (OAuthToken & { ok: true }) | { ok: false; status: "pending" | "slow_down" | (string & {}) }
  >
}

export type OAuthBrowserLogin = OAuthProvider & OAuthLogin & OAuthBrowserOpts
export type OAuthDeviceLogin = OAuthProvider & OAuthLogin & OAuthDeviceOpts

export type OAuthResponse<T> = { error: (msg?: string) => never } & (
  | {
      ok: true
      json: T
    }
  | { ok: false; json?: T }
)
