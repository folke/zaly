/**
 * OpenAI Codex (ChatGPT) OAuth flow.
 *
 * - Login: PKCE against `auth.openai.com/oauth/authorize`, with a local
 *   HTTP callback on `127.0.0.1:1455`. Falls back to manual paste when
 *   the port can't be bound.
 * - Refresh: standard OAuth token endpoint with `grant_type=refresh_token`.
 * - Storage: JSON file at `~/.zaly/auth/openai-codex.json` (override via
 *   `ZALY_ROOT`).
 * - Auth provider: `codexAuth` reads (and refreshes) the file on demand,
 *   yielding `{ apiKey: access_token, headers: { ... } }` for any model
 *   whose `provider === "openai-codex"`.
 *
 * Mirrors codex CLI's flow but uses zaly-owned storage so we never
 * collide with codex's own `~/.codex/auth.json`.
 */

import type { ModelSpec } from "../types.ts"
import type { AuthProvider, AuthCredentials } from "./auth.ts"

import { normPath } from "@zaly/shared"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
// oxlint-disable-next-line no-restricted-imports
import { dirname } from "node:path"

// ── Config ──────────────────────────────────────────────────────────────

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize"
const TOKEN_URL = "https://auth.openai.com/oauth/token"
const CALLBACK_HOST = process.env.ZALY_OAUTH_CALLBACK_HOST ?? "127.0.0.1"
const CALLBACK_PORT = 1455
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/auth/callback`
const SCOPE = "openid profile email offline_access"
const JWT_AUTH_CLAIM = "https://api.openai.com/auth"
/** Refresh tokens this many seconds before nominal expiry, so a request
 *  in flight doesn't see a freshly-stale token. */
const REFRESH_LEEWAY_SEC = 60

const STORAGE_PATH = normPath(
  process.env.ZALY_OPENAI_CODEX_AUTH ?? "~/.zaly/auth/openai-codex.json"
)

// ── Types ───────────────────────────────────────────────────────────────

/** Persisted credential record. `accountId` is denormalised from the
 *  access-token JWT for convenience — codex requires it in the
 *  `chatgpt-account-id` header on every request. */
export interface CodexCredentials {
  access: string
  refresh: string
  /** Wall-clock ms epoch the access token expires at. */
  expires: number
  accountId: string
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
}

interface JwtPayload {
  [JWT_AUTH_CLAIM]?: { chatgpt_account_id?: string }
  [k: string]: unknown
}

// ── JWT helpers ─────────────────────────────────────────────────────────

function decodeJwt(token: string): JwtPayload | undefined {
  const parts = token.split(".")
  if (parts.length !== 3) return undefined
  try {
    return JSON.parse(atob(parts[1])) as JwtPayload
  } catch {
    return undefined
  }
}

function extractAccountId(accessToken: string): string {
  const payload = decodeJwt(accessToken)
  const accountId = payload?.[JWT_AUTH_CLAIM]?.chatgpt_account_id
  if (typeof accountId !== "string" || accountId === "") {
    throw new Error("Failed to extract chatgpt_account_id from access token")
  }
  return accountId
}

// ── Token endpoint ──────────────────────────────────────────────────────

async function exchangeAuthorizationCode(
  code: string,
  verifier: string
): Promise<CodexCredentials> {
  const response = await fetch(TOKEN_URL, {
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`OpenAI Codex token exchange failed (${response.status}): ${text}`)
  }
  const json = (await response.json()) as TokenResponse
  return toCredentials(json)
}

async function refreshAccessToken(refresh: string): Promise<CodexCredentials> {
  const response = await fetch(TOKEN_URL, {
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`OpenAI Codex token refresh failed (${response.status}): ${text}`)
  }
  const json = (await response.json()) as TokenResponse
  return toCredentials(json)
}

function toCredentials(json: TokenResponse): CodexCredentials {
  if (
    typeof json.access_token !== "string" ||
    typeof json.refresh_token !== "string" ||
    typeof json.expires_in !== "number"
  ) {
    throw new Error(`OpenAI Codex token response missing fields: ${JSON.stringify(json)}`)
  }
  return {
    access: json.access_token,
    accountId: extractAccountId(json.access_token),
    expires: Date.now() + json.expires_in * 1000,
    refresh: json.refresh_token,
  }
}

// ── Persistence ─────────────────────────────────────────────────────────

async function readCodexCredentials(): Promise<CodexCredentials | undefined> {
  try {
    const raw = await readFile(STORAGE_PATH, "utf8")
    return JSON.parse(raw) as CodexCredentials
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

async function writeCodexCredentials(creds: CodexCredentials): Promise<void> {
  await mkdir(dirname(STORAGE_PATH), { mode: 0o700, recursive: true })
  await writeFile(STORAGE_PATH, JSON.stringify(creds, undefined, 2), { mode: 0o600 })
}

// ── Login flow ──────────────────────────────────────────────────────────

export interface CodexLoginCallbacks {
  /** Called once the authorize URL is ready. The CLI/TUI should open
   *  this in a browser (or print it) and surface `instructions`. */
  onAuthUrl: (info: { url: string; instructions: string }) => void | Promise<void>
  /** Optional progress messages — connection bound, browser callback
   *  received, token exchange in flight, etc. */
  onProgress?: (message: string) => void | Promise<void>
  /** Optional manual paste fallback — used when the local callback
   *  server fails to bind, or as a parallel race against the browser
   *  redirect. Resolves with what the user pasted (a code, a URL with
   *  `?code=`, or a `code#state` fragment). */
  onManualCodeInput?: () => Promise<string>
  /** Abort the in-flight login. Closes the local server and rejects. */
  signal?: AbortSignal
}

/** Drive the full PKCE login flow. Persists creds on success and
 *  returns them. Caller supplies UI callbacks for opening the browser
 *  and (optionally) accepting a manually pasted code. */
export async function loginCodex(callbacks: CodexLoginCallbacks): Promise<CodexCredentials> {
  const { generatePkce } = await import("./utils.ts")
  const { challenge, verifier } = await generatePkce()
  const state = randomState()

  const authorizeUrl = buildAuthorizeUrl(challenge, state)
  await callbacks.onAuthUrl({
    instructions:
      "A browser window should open for you to authorize zaly with your ChatGPT account.",
    url: authorizeUrl,
  })

  const code = await captureCode({
    callbacks,
    state,
  })

  await callbacks.onProgress?.("Exchanging authorization code for tokens…")
  const creds = await exchangeAuthorizationCode(code, verifier)
  await writeCodexCredentials(creds)
  await callbacks.onProgress?.(`Saved credentials to ${STORAGE_PATH}`)
  return creds
}

function buildAuthorizeUrl(challenge: string, state: string): string {
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", CLIENT_ID)
  url.searchParams.set("redirect_uri", REDIRECT_URI)
  url.searchParams.set("scope", SCOPE)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  url.searchParams.set("state", state)
  url.searchParams.set("id_token_add_organizations", "true")
  url.searchParams.set("codex_cli_simplified_flow", "true")
  url.searchParams.set("originator", "zaly")
  return url.toString()
}

function randomState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Race the local callback server against the optional manual-paste
 *  prompt. Whichever resolves first wins; the loser is cancelled. */
async function captureCode(opts: {
  callbacks: CodexLoginCallbacks
  state: string
}): Promise<string> {
  const { callbacks, state } = opts
  const server = await startCallbackServer(state, callbacks)

  const racers: Promise<string>[] = [server.waitForCode()]
  if (callbacks.onManualCodeInput) {
    racers.push(callbacks.onManualCodeInput().then((input) => parseManualInput(input, state)))
  }
  if (callbacks.signal) {
    racers.push(
      new Promise<string>((_, reject) => {
        callbacks.signal!.addEventListener("abort", () => reject(new Error("Login aborted")), {
          once: true,
        })
      })
    )
  }

  try {
    return await Promise.race(racers)
  } finally {
    server.close()
  }
}

/** Parse whatever the user pasted in the manual fallback. Accepts:
 *
 *    - the bare `code` (most common)
 *    - the full redirect URL (`http://localhost:1455/auth/callback?code=…&state=…`)
 *    - `code#state` shorthand
 *
 *  Validates `state` when present. */
function parseManualInput(input: string, expectedState: string): string {
  const value = input.trim()
  if (value === "") throw new Error("Empty code")
  // Full URL form.
  try {
    const url = new URL(value)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (state !== null && state !== expectedState) throw new Error("State mismatch")
    if (code !== null && code !== "") return code
  } catch {
    // Not a URL — fall through to bareword forms.
  }
  // `code#state` shorthand.
  if (value.includes("#")) {
    const [code, state] = value.split("#", 2) as [string, string]
    if (state !== "" && state !== expectedState) throw new Error("State mismatch")
    return code
  }
  // `code=…&state=…` query-string fragment.
  if (value.includes("code=")) {
    const params = new URLSearchParams(value)
    const code = params.get("code")
    const state = params.get("state")
    if (state !== null && state !== expectedState) throw new Error("State mismatch")
    if (code !== null && code !== "") return code
  }
  // Bare code.
  return value
}

interface CallbackServer {
  waitForCode(): Promise<string>
  close(): void
}

/** Bind a one-shot HTTP server on `127.0.0.1:1455` waiting for the
 *  redirect. On bind failure (port in use, sandbox blocked) returns a
 *  stub whose `waitForCode` never resolves — the caller falls back to
 *  manual paste via `onManualCodeInput`. */
async function startCallbackServer(
  state: string,
  callbacks: CodexLoginCallbacks
): Promise<CallbackServer> {
  let resolveCode: ((code: string) => void) | undefined
  let rejectCode: ((error: Error) => void) | undefined
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const { oauthErrorPage, oauthSuccessPage } = await import("./oauth-page.ts")

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "", "http://localhost")
      if (url.pathname !== "/auth/callback") {
        res.statusCode = 404
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(oauthErrorPage("Callback route not found."))
        return
      }
      const stateParam = url.searchParams.get("state")
      if (stateParam !== state) {
        res.statusCode = 400
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(oauthErrorPage("State mismatch — refusing the callback."))
        rejectCode?.(new Error("OAuth state mismatch"))
        return
      }
      const code = url.searchParams.get("code")
      if (code === null || code === "") {
        res.statusCode = 400
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(oauthErrorPage("Missing authorization code in callback."))
        rejectCode?.(new Error("Missing authorization code"))
        return
      }
      res.statusCode = 200
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(oauthSuccessPage())
      resolveCode?.(code)
    } catch (error) {
      res.statusCode = 500
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(oauthErrorPage("Internal error while handling callback."))
      rejectCode?.(error instanceof Error ? error : new Error(String(error)))
    }
  })

  return new Promise<CallbackServer>((resolve) => {
    server
      .once("error", (err: NodeJS.ErrnoException) => {
        // Bind failure — surface as progress and let the caller's
        // manual-paste fallback handle the flow.
        void callbacks.onProgress?.(
          `Could not bind ${CALLBACK_HOST}:${CALLBACK_PORT} (${err.code ?? err.message}). Falling back to manual paste.`
        )
        resolve({ close: () => {}, waitForCode: () => codePromise })
      })
      .listen(CALLBACK_PORT, CALLBACK_HOST, () => {
        void callbacks.onProgress?.(
          `Listening on http://${CALLBACK_HOST}:${CALLBACK_PORT}/auth/callback for the OAuth redirect…`
        )
        resolve({
          close: () => {
            try {
              server.close()
            } catch {
              // ignore — best effort
            }
          },
          waitForCode: () => codePromise,
        })
      })
  })
}

// ── AuthProvider ────────────────────────────────────────────────────────

/** Returns true when the credential needs a refresh before use. */
function isStale(creds: CodexCredentials, now = Date.now()): boolean {
  return creds.expires - now <= REFRESH_LEEWAY_SEC * 1000
}

/** Get the current credential, refreshing on disk if expired. Returns
 *  `undefined` when no file exists (user hasn't run `loginCodex`). */
async function getCodexCredentials(): Promise<CodexCredentials | undefined> {
  const creds = await readCodexCredentials()
  if (creds === undefined) return undefined
  if (!isStale(creds)) return creds

  const refreshed = await refreshAccessToken(creds.refresh)
  await writeCodexCredentials(refreshed)
  return refreshed
}

/** Build the headers codex backend requires alongside the bearer
 *  token. `originator` identifies the client to OpenAI; `OpenAI-Beta`
 *  selects the experimental responses surface; `User-Agent` is
 *  validated server-side — Bun's default UA is rejected with 401. */
function buildCodexHeaders(creds: CodexCredentials): Record<string, string> {
  return {
    "OpenAI-Beta": "responses=experimental",
    "User-Agent": `zaly (${process.platform} ${process.release.name}; ${process.arch})`,
    "chatgpt-account-id": creds.accountId,
    originator: "zaly",
  }
}

/** Auth provider for the synthetic `openai-codex` provider id. Returns
 *  `undefined` for every other model so it composes cleanly via
 *  `chainAuth(codexAuth, envAuth)`. */
export const codexAuth: AuthProvider = {
  async getAuth(model: ModelSpec): Promise<AuthCredentials | undefined> {
    if (model.providerInfo?.id !== "openai-codex") return undefined
    const creds = await getCodexCredentials()
    if (creds === undefined) return undefined
    return { apiKey: creds.access, headers: buildCodexHeaders(creds) }
  },
}
