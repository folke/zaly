/**
 * Live preview harness for the OAuth callback HTML pages.
 *
 * Run:  bun packages/ai/test/oauth.ts
 *
 * Spins up the same HTTP server the codex login flow uses, but routes
 * `/success` / `/error` to the styled pages directly so you can iterate
 * on the design without running through a real OAuth round-trip.
 *
 * `/auth/callback` mirrors what users actually hit at the end of a
 * real flow — `?code=…` shows success, missing `code` shows error.
 */

import { createServer } from "node:http"
import { oauthErrorPage, oauthSuccessPage } from "../src/auth/oauth-page.ts"

const PORT = 1455
const HOST = "127.0.0.1"

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "", `http://${HOST}`)
  res.setHeader("Content-Type", "text/html; charset=utf-8")

  switch (url.pathname) {
    case "/success": {
      res.statusCode = 200
      res.end(oauthSuccessPage())
      return
    }
    case "/error": {
      res.statusCode = 400
      res.end(oauthErrorPage(url.searchParams.get("detail") ?? "Something went wrong."))
      return
    }
    case "/auth/callback": {
      const code = url.searchParams.get("code")
      if (code === null || code === "") {
        res.statusCode = 400
        res.end(oauthErrorPage("Missing authorization code in callback."))
        return
      }
      res.statusCode = 200
      res.end(oauthSuccessPage())
      return
    }
    default: {
      res.statusCode = 404
      res.end(oauthErrorPage("Route not found."))
    }
  }
})

server.listen(PORT, HOST, () => {
  const base = `http://${HOST}:${PORT}`
  console.log(`oauth preview running at ${base}`)
  console.log(`  ${base}/success`)
  console.log(`  ${base}/error`)
  console.log(`  ${base}/error?detail=State+mismatch+%E2%80%94+refusing+the+callback.`)
  console.log(`  ${base}/auth/callback?code=demo&state=demo`)
  console.log(`  ${base}/auth/callback   (no code → error page)`)
  console.log(`Ctrl-C to stop`)
})
