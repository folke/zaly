import type {
  OAuthExchangeCodeRequest,
  OAuthToken,
  OAuthTokenRequest,
  OAuthTokenResponse,
} from "./types.ts"

import { URLSearchParams } from "node:url"
import { safeFetch } from "./utils.ts"

export async function refreshToken(
  token: OAuthToken,
  opts: OAuthTokenRequest
): Promise<OAuthToken> {
  if (!token.refresh) throw new Error("No refresh token available")

  const res = await safeFetch<OAuthTokenResponse>(opts.tokenUrl, {
    body: new URLSearchParams({
      client_id: opts.clientId,
      grant_type: "refresh_token",
      refresh_token: token.refresh,
      ...opts.params,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...opts.headers,
    },
    method: "POST",
    signal: opts.signal,
  })

  return parseToken(res.json ?? {}, token)
}

export function parseToken(res: OAuthTokenResponse, token?: OAuthToken) {
  const json = res
  if (!json.access_token)
    throw new Error(
      `OAuth response missing \`access_token\`:\n\`\`\`json\n${JSON.stringify(json, undefined, 2)}\n\`\`\``
    )
  return {
    access: json.access_token,
    expires: typeof json.expires_in === "number" ? Date.now() + json.expires_in * 1000 : Infinity,
    refresh: typeof json.refresh_token === "string" ? json.refresh_token : token?.refresh,
  }
}

export async function exchangeAuthCode(opts: OAuthExchangeCodeRequest): Promise<OAuthToken> {
  const res = await safeFetch<OAuthTokenResponse>(opts.tokenUrl, {
    body: new URLSearchParams({
      client_id: opts.clientId,
      code: opts.code,
      code_verifier: opts.verifier,
      grant_type: "authorization_code",
      redirect_uri: opts.redirectUrl,
      ...opts.params,
    }),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...opts.headers,
    },
    method: "POST",
    signal: opts.signal,
  })

  return parseToken(res.json ?? {})
}
