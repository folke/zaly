/** PKCE (Proof Key for Code Exchange) helpers for OAuth 2.1 flows.
 *  Web-Crypto-based, runtime-agnostic — works in Node, Bun, browsers.
 *
 *  RFC 7636:
 *    verifier  — random 32-byte → base64url
 *    challenge — SHA-256(verifier) → base64url
 *
 *  The authorization server is told the *challenge* up front; the
 *  *verifier* is sent in the token-exchange step. The server
 *  re-derives the challenge and compares — proving the same client
 *  initiated both halves of the flow without ever transmitting a
 *  shared secret. */

function base64url(bytes: Uint8Array): string {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export interface Pkce {
  verifier: string
  challenge: string
}

export async function generatePkce(): Promise<Pkce> {
  const verifierBytes = new Uint8Array(32)
  crypto.getRandomValues(verifierBytes)
  const verifier = base64url(verifierBytes)

  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest("SHA-256", data)
  const challenge = base64url(new Uint8Array(hash))

  return { challenge, verifier }
}
