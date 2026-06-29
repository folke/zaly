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

import type { JsonObject } from "@zaly/shared/json"
import type { OAuthResponse } from "./types.ts"

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

export const zalyUserAgent = `zaly (${process.platform} ${process.release.name}; ${process.arch})`

export type SafeFetchRequest = Omit<RequestInit, "headers"> & {
  throw?: boolean
  headers?: Record<string, string>
}

export function wrapSafeFetch(opts: SafeFetchRequest): typeof safeFetch {
  return async function safeFetchWrapper<T extends JsonObject = JsonObject>(
    url: string,
    req?: SafeFetchRequest
  ): Promise<OAuthResponse<T>> {
    return await safeFetch(url, { ...opts, ...req })
  }
}

export async function safeFetch<T extends JsonObject = JsonObject>(
  url: string,
  opts?: SafeFetchRequest
): Promise<OAuthResponse<T>> {
  const res = await fetch(url, {
    ...opts,
    headers: { "User-Agent": zalyUserAgent, ...opts?.headers },
  })
  const text = await res.text()
  let json: T | undefined
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = undefined
  }

  const error = (msg?: string) => {
    const body = json
      ? `\`\`\`json\n${JSON.stringify(json, undefined, 2)}\n\`\`\``
      : `\`\`\`\n${text}\n\`\`\``
    msg ??= `OAuth request failed:`
    throw new Error(
      `${msg}\n- **url**: [${url}](${url})\n- **status**: ${res.status} ${res.statusText}\n- **body**:\n${body}`
    )
  }

  if (!res.ok && opts?.throw !== false) error()

  return res.ok ? { error, json: json ?? ({} as T), ok: true } : { error, json, ok: false }
}
