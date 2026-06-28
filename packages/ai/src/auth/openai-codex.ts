import type { ApiKey } from "./manager.ts"
import type { OAuthOptions, OAuthTokens } from "./oauth/types.ts"

const JWT_AUTH_CLAIM = "https://api.openai.com/auth"
const AUTH_ID = "codex"

interface JwtPayload {
  [JWT_AUTH_CLAIM]?: { chatgpt_account_id?: string }
  [k: string]: unknown
}

export const codexOauth: OAuthOptions = {
  authorizeParams: {
    codex_cli_simplified_flow: "true",
    id_token_add_organizations: "true",
    originator: "zaly",
  },
  authorizeUrl: "https://auth.openai.com/oauth/authorize",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  deviceUrl: "https://auth.openai.com/codex/device",
  id: AUTH_ID,
  name: "Codex (ChatGPT)",
  redirectUri: `http://localhost:1455/auth/callback`,
  scope: "openid profile email offline_access",
  toApiKey,
  tokenUrl: "https://auth.openai.com/oauth/token",
}

function toApiKey(creds: OAuthTokens): ApiKey {
  return { headers: buildCodexHeaders(creds), key: creds.access, source: "oauth" }
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

function buildCodexHeaders(creds: OAuthTokens): Record<string, string> {
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
