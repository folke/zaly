import type { OAuthBrowserLogin, OAuthToken } from "./types.ts"

import { exchangeAuthCode } from "./token.ts"

export async function browserLogin(opts: OAuthBrowserLogin): Promise<OAuthToken | undefined> {
  const { generatePkce } = await import("./utils.ts")
  const { challenge, verifier } = await generatePkce()
  const state = randomState()
  const url = new URL(opts.authorizeUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", opts.clientId)
  url.searchParams.set("redirect_uri", opts.redirectUrl)
  url.searchParams.set("scope", opts.scope)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", state)

  const u = url.toString()

  void opts.browse?.(u)
  await opts.notify?.({
    details: `Open [this URL](${u}) in your browser and complete login,
or paste the authorization code / redirect URL here.

[${u}](${u})`,
    title: `**${opts.name}** Login (browser)`,
  })

  const { captureCode } = await import("./server.ts")

  const code = await captureCode({ ...opts, state })
  if (!code) return // aborted

  return await exchangeAuthCode({ ...opts, code, redirectUrl: opts.redirectUrl, verifier })
}

function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}
