import type { ApiKey } from "./manager.ts"
import type { OAuthOptions, OAuthToken } from "./oauth/types.ts"

import { exchangeAuthCode } from "./oauth/token.ts"

const JWT_AUTH_CLAIM = "https://api.openai.com/auth"

interface JwtPayload {
  [JWT_AUTH_CLAIM]?: { chatgpt_account_id?: string }
  [k: string]: unknown
}

type CodexDeviceStartResponse = {
  device_auth_id?: string
  user_code?: string
  interval?: string
  expires_at?: string
}

type CodexDevicePollResponse = {
  authorization_code?: string
  code_verifier?: string
  error?: string | { code?: string }
}

const CODEX = "Codex (ChatGPT)"
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const CODEX_DEVICE_URL = "https://auth.openai.com/api/accounts/deviceauth/usercode"
const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token"
const CODEX_DEVICE_TOKEN_URL = "https://auth.openai.com/api/accounts/deviceauth/token"
const CODEX_DEVICE_VERIFY_URL = "https://auth.openai.com/codex/device"
const CODEX_DEVICE_REDIRECT_URL = "https://auth.openai.com/deviceauth/callback"
const CODEX_REDIRECT_URL = `http://localhost:1455/auth/callback`
const CODEX_SCOPE = "openid profile email offline_access"
const CODEX_AUTHORIZE_URL = new URL("https://auth.openai.com/oauth/authorize")
CODEX_AUTHORIZE_URL.searchParams.set("codex_cli_simplified_flow", "true")
CODEX_AUTHORIZE_URL.searchParams.set("id_token_add_organizations", "true")
CODEX_AUTHORIZE_URL.searchParams.set("originator", "zaly")

// oxlint-disable-next-line sort-keys
export const codexOauth: OAuthOptions = {
  name: CODEX,
  clientId: CODEX_CLIENT_ID,
  tokenUrl: CODEX_TOKEN_URL,

  apiKey: (creds: OAuthToken): ApiKey => ({
    headers: buildCodexHeaders(creds),
    key: creds.access,
    source: "oauth",
  }),

  browser: {
    authorizeUrl: CODEX_AUTHORIZE_URL,
    redirectUrl: CODEX_REDIRECT_URL,
    scope: CODEX_SCOPE,
  },

  // oxlint-disable-next-line sort-keys
  device: {
    start: async (ctx) => {
      const res = await ctx.fetch<CodexDeviceStartResponse>(CODEX_DEVICE_URL, {
        body: JSON.stringify({ client_id: ctx.clientId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })
      const json = res.json ?? {}
      if (!json.device_auth_id || !json.user_code || !json.interval || !json.expires_at) {
        return res.error(`Failed to get device code:`)
      }
      return {
        deviceCode: json.device_auth_id,
        expires: Date.parse(json.expires_at),
        interval: Number(json.interval),
        userCode: json.user_code,
        verificationUrl: CODEX_DEVICE_VERIFY_URL,
      }
    },
    poll: async (device, ctx) => {
      const res = await ctx.fetch<CodexDevicePollResponse>(CODEX_DEVICE_TOKEN_URL, {
        body: JSON.stringify({ device_auth_id: device.deviceCode, user_code: device.userCode }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        throw: false,
      })
      const json = res.json ?? {}
      if (res.ok) {
        if (!json.authorization_code || !json.code_verifier)
          return res.error("Missing authorization_code or code_verifier in response")
        const token = await exchangeAuthCode({
          clientId: ctx.clientId,
          code: json.authorization_code,
          name: ctx.name,
          redirectUrl: CODEX_DEVICE_REDIRECT_URL,
          tokenUrl: ctx.tokenUrl,
          verifier: json.code_verifier,
        })
        return { ...token, ok: true }
      }
      const e = res.json?.error ?? ""
      const error = typeof e === "string" ? e : (e.code ?? "")
      if (error === "deviceauth_authorization_pending") return { ok: false, status: "pending" }
      if (error === "slow_down") return { ok: false, status: "slow_down" }
      return res.error(`Device login failed`)
    },
  },
}

function decodeJwt(token: string): JwtPayload | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(atob(parts[1])) as JwtPayload
  } catch {
    return undefined
  }
}

function buildCodexHeaders(creds: OAuthToken): Record<string, string> {
  const payload = decodeJwt(creds.access)
  const accountId = payload?.[JWT_AUTH_CLAIM]?.chatgpt_account_id
  if (typeof accountId !== "string" || accountId === "") {
    throw new Error("Failed to extract chatgpt_account_id from access token")
  }
  return {
    "OpenAI-Beta": "responses=experimental",
    "User-Agent": `zaly (${process.platform} ${process.release.name}; ${process.arch})`,
    "chatgpt-account-id": accountId,
    originator: "zaly",
  }
}
