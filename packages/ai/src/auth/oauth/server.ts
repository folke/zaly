import type { OAuthBrowserLogin } from "./types.ts"

import { createServer } from "node:http"

type OAuthCapture = OAuthBrowserLogin & { state: string }

export async function captureCode(opts: OAuthCapture): Promise<string | undefined> {
  let server: CallbackServer | undefined
  const racers: Promise<string | undefined>[] = []
  try {
    server = await createOAuthServer(opts)
    racers.push(server.waitForCode())
  } catch (error) {
    opts.logger?.warn(
      `Could not start callback server: ${error instanceof Error ? error.message : String(error)}.\nFalling back to manual paste.`
    )
  }

  if (opts.prompt) {
    racers.push(
      opts
        .prompt("Paste the authorization code or redirect URL here")
        .then((input) => (input ? parseManualInput(input, opts.state) : undefined))
    )
  }

  if (opts.signal) {
    racers.push(
      new Promise<string | undefined>((resolve) => {
        opts.signal!.addEventListener("abort", () => resolve(undefined), {
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

export async function createOAuthServer(opts: OAuthCapture): Promise<CallbackServer> {
  const codeProm = Promise.withResolvers<string>()
  const { oauthPages } = await import("./page.ts")
  const pages = oauthPages(opts.name)
  const uri = new URL(opts.redirectUrl)
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
