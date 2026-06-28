import type { OAuthLogin } from "./types.ts"

import { createServer } from "node:http"

export async function captureCode(
  opts: OAuthLogin & {
    provider: string
    state: string
    redirectUri: string
  }
): Promise<string> {
  let server: CallbackServer | undefined
  const racers: Promise<string>[] = []
  try {
    server = await createOAuthServer(opts)
    opts.logger?.info(`Listening for OAuth callback on ${opts.redirectUri}`)
    racers.push(server.waitForCode())
  } catch (error) {
    opts.logger?.warn(
      `Could not start callback server: ${error instanceof Error ? error.message : String(error)}.\nFalling back to manual paste.`
    )
  }

  if (opts.onPrompt) {
    racers.push(
      opts.onPrompt("Paste the callback URL:").then((input) => parseManualInput(input, opts.state))
    )
  }

  if (opts.signal) {
    racers.push(
      new Promise<string>((_, reject) => {
        opts.signal!.addEventListener("abort", () => reject(new Error("Login aborted")), {
          once: true,
        })
      })
    )
  }

  try {
    return await Promise.race(racers)
  } finally {
    server?.close()
  }
}

function parseManualInput(input: string, expectedState: string): string {
  const value = input.trim()
  if (value === "") throw new Error("Empty code")
  try {
    const url = new URL(value)
    const code = url.searchParams.get("code")
    const state = url.searchParams.get("state")
    if (state !== null && state !== expectedState) throw new Error("State mismatch")
    if (code !== null && code !== "") return code
  } catch {
    // Not a URL.
  }
  if (value.includes("#")) {
    const [code, state] = value.split("#", 2) as [string, string]
    if (state !== "" && state !== expectedState) throw new Error("State mismatch")
    return code
  }
  if (value.includes("code=")) {
    const params = new URLSearchParams(value)
    const code = params.get("code")
    const state = params.get("state")
    if (state !== null && state !== expectedState) throw new Error("State mismatch")
    if (code !== null && code !== "") return code
  }
  return value
}

export type CallbackServer = {
  waitForCode: () => Promise<string>
  close: () => void
}

export type CallbackServerOpts = {
  provider: string
  state: string
  redirectUri: string
}

export async function createOAuthServer(opts: CallbackServerOpts): Promise<CallbackServer> {
  const codeProm = Promise.withResolvers<string>()
  const { oauthPages } = await import("./page.ts")
  const pages = oauthPages(opts.provider)
  const uri = new URL(opts.redirectUri)
  const path = uri.pathname

  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "", "http://localhost")
      if (url.pathname !== path) {
        res.statusCode = 404
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(pages.error("Callback route not found."))
        return
      }
      const state = url.searchParams.get("state")
      if (state !== opts.state) {
        res.statusCode = 400
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(pages.error("State mismatch — refusing the callback."))
        codeProm.reject(new Error("OAuth state mismatch"))
        return
      }
      const code = url.searchParams.get("code")
      if (code === null || code === "") {
        res.statusCode = 400
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end(pages.error("Missing authorization code in callback."))
        codeProm.reject(new Error("Missing authorization code"))
        return
      }
      res.statusCode = 200
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(pages.success())
      codeProm.resolve(code)
    } catch (error) {
      res.statusCode = 500
      res.setHeader("Content-Type", "text/html; charset=utf-8")
      res.end(pages.error("Internal error while handling callback."))
      codeProm.reject(error instanceof Error ? error : new Error(String(error)))
    }
  })

  const ret = Promise.withResolvers<CallbackServer>()

  server
    .once("error", (error: NodeJS.ErrnoException) => ret.reject(error))
    .listen(Number(uri.port || 0), uri.hostname || "127.0.0.1", () => {
      ret.resolve({
        close: () => {
          try {
            server.close()
          } catch {}
        },
        waitForCode: () => codeProm.promise,
      })
    })

  return ret.promise
}
