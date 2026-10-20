import type { Attachment, MetaPart, TextPart } from "@zaly/ai"

import { runTool, zalyUserAgent } from "@zaly/ai"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "pathe"
import { afterAll, beforeAll, expect, test } from "vitest"
import { fetchTool } from "../src/tools/fetch.ts"

const html = `<html><head><title>Test page</title></head><body><nav>Menu</nav>
<main><h1>Hello</h1><p>Read <a href="../guide">the guide</a>.</p></main></body></html>`
const xml = '<?xml version="1.0" encoding="UTF-8"?><VOTABLE><RESOURCE/></VOTABLE>'
const large = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`).join("\n")
const server = createServer((req, res) => {
  const path = new URL(req.url!, "http://localhost").pathname
  if (path === "/redirect") {
    res.writeHead(302, { location: "/docs/page" }).end()
    return
  }
  if (path === "/echo") {
    let body = ""
    req.setEncoding("utf8")
    req.on("data", (chunk) => {
      body += chunk
    })
    req.on("end", () => {
      res.setHeader("Content-Type", "application/json")
      res.end(
        JSON.stringify({
          body,
          method: req.method,
          query: req.url,
          token: req.headers["x-token"],
          userAgent: req.headers["user-agent"],
        })
      )
    })
    return
  }
  if (path === "/image") {
    res.setHeader("Content-Type", "application/octet-stream")
    res.end(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZe0AAAAASUVORK5CYII=",
        "base64"
      )
    )
    return
  }
  const routes: Record<string, [string, string] | undefined> = {
    "/docs/page": ["text/html", html],
    "/json": ["application/json", '{"items":[{"id":1},{"id":2}]}'],
    "/bad-json": ["application/json", "not JSON"],
    "/plain": ["text/plain", "hello"],
    "/xml": ["application/x-votable+xml", xml],
    "/markdown": ["text/markdown", "# Native markdown\n\n[Link](/relative)"],
    "/long": ["text/plain", large],
    "/long-line": ["text/plain", "😀".repeat(2000)],
    "/long-html": [
      "text/html",
      `<main>${large
        .split("\n")
        .map((line) => `<p>${line}</p>`)
        .join("")}</main>`,
    ],
    "/long-json": ["application/json", JSON.stringify({ text: "x".repeat(60_000) })],
    "/shell": ["text/html", "<html><body><div id='app'></div></body></html>"],
    "/mislabelled": ["text/plain", "<main><h1>Mislabelled</h1></main>"],
  }
  const response = routes[path]
  res.writeHead(response ? 200 : 404, { "Content-Type": response?.[0] ?? "text/html" })
  res.end(response?.[1] ?? "<main><h1>Not found</h1></main>")
})
let origin: string
let dir: string
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "zaly-fetch-test-"))
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing server address")
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  rmSync(dir, { force: true, recursive: true })
})

async function call(path: string, overrides: Record<string, unknown> = {}) {
  const args = await fetchTool.validator.validateParams({ url: `${origin}${path}`, ...overrides })
  const parts = (await fetchTool.call(args, { sessionDir: dir })) as (
    | Attachment
    | MetaPart
    | TextPart
  )[]
  const meta = parts.find((part): part is MetaPart => part.type === "meta")!.data as {
    url: string
    title?: string
    status: number
    ok: boolean
    warning?: string
    truncated?: { fullOutputPath: string; totalLines: number; totalBytes: number }
  }
  const text = parts.find((part): part is TextPart => part.type === "text")
  return { meta, parts, text }
}

test("fetch publishes structured metadata through the tool runner", async () => {
  const result = await runTool(fetchTool, { url: `${origin}/redirect` }, {})
  expect(result.isError).toBe(false)
  expect(result.meta).toMatchObject({
    kind: "fetch",
    type: "text",
    format: "markdown",
    title: "Test page",
    status: 200,
    url: `${origin}/docs/page`,
  })
  const image = await runTool(fetchTool, { url: `${origin}/image` }, {})
  expect(image.meta).toMatchObject({ kind: "fetch", type: "image", status: 200 })
})

test("HTML defaults to readable Markdown and resolves against the final response URL", async () => {
  const { meta, text } = await call("/redirect")
  expect(meta.url).toBe(`${origin}/docs/page`)
  expect(meta.title).toBe("Test page")
  expect(text?.format).toBe("markdown")
  expect(text?.text).toContain(`# Hello\n\nRead [the guide](${origin}/guide).`)
  expect(text?.text).not.toContain("Menu")
})

test("raw returns the original HTML or JSON; forced markdown handles unrecognized HTML", async () => {
  const [raw, json, markdown] = await Promise.all([
    call("/docs/page", { format: "raw" }),
    call("/json", { format: "raw" }),
    call("/mislabelled", { format: "markdown" }),
  ])
  expect(raw.text?.text).toBe(html)
  expect(json.text?.text).toBe('{"items":[{"id":1},{"id":2}]}')
  expect(markdown.text?.text).toBe("# Mislabelled")
})

test("JSONPath, request options, and existing text handling remain available", async () => {
  const [json, plain, invalid, markdown] = await Promise.all([
    call("/json", { jsonpath: "$.items[*].id" }),
    call("/plain"),
    call("/bad-json"),
    call("/markdown"),
  ])
  expect(json.text?.text).toBe("[\n  1,\n  2\n]")
  expect(plain.text?.text).toBe("hello")
  expect(invalid.text?.text).toBe("not JSON")
  expect(invalid.text?.format).toBeUndefined()
  expect(markdown.text?.format).toBe("markdown")
  const { text } = await call("/echo", {
    body: "payload",
    headers: { "x-token": "test" },
    method: "POST",
    query: { q: "hello world" },
  })
  expect(JSON.parse(text!.text)).toEqual({
    body: "payload",
    method: "POST",
    query: "/echo?q=hello+world",
    token: "test",
    userAgent: zalyUserAgent,
  })
})

test("XML responses stay text instead of being decoded as SVG images", async () => {
  const result = await runTool(fetchTool, { url: `${origin}/xml` }, {})
  expect(result.isError).toBe(false)
  expect(result.meta).toMatchObject({ type: "text", format: "xml" })
  expect(result.content).toContainEqual(expect.objectContaining({ type: "text", text: xml }))
  expect(result.content).not.toContainEqual(expect.objectContaining({ type: "image" }))
})

test("caller User-Agent overrides are case-insensitive", async () => {
  const { text } = await call("/echo", { headers: { "uSeR-aGeNt": "custom-client" } })
  expect(JSON.parse(text!.text).userAgent).toBe("custom-client")
})

test("invalid JSONPath combinations fail explicitly", async () => {
  await expect(call("/json", { format: "raw", jsonpath: "$.items" })).rejects.toThrow(
    /cannot be combined/
  )
  await expect(call("/plain", { jsonpath: "$.items" })).rejects.toThrow(/requires a valid JSON/)
})

test("fetch honors the tool cancellation signal", async () => {
  const args = await fetchTool.validator.validateParams({ url: `${origin}/plain` })
  await expect(fetchTool.call(args, { signal: AbortSignal.abort() })).rejects.toThrow(/abort/i)
})

test("small outputs do not create saved files", async () => {
  const files = readdirSync(dir)
  const result = await call("/plain")
  expect(result.meta.truncated).toBeUndefined()
  expect(readdirSync(dir)).toEqual(files)
})

test("truncation saves all text and returns a head/tail summary", async () => {
  const { meta, text } = await call("/long", { limit: 4 })
  expect(text?.text).toBe("line 1\nline 2\n [ … truncated 21 lines]\nline 24\nline 25")
  expect(meta.truncated?.totalLines).toBe(25)
  expect(meta.truncated?.fullOutputPath.startsWith(dir)).toBe(true)
  expect(readFileSync(meta.truncated!.fullOutputPath, "utf8")).toBe(large)
})

test("truncated HTML saves the complete converted Markdown, not the source HTML", async () => {
  const result = await call("/long-html")
  const full = result.text!.text
  const { meta } = await call("/long-html", { limit: 4 })
  expect(meta.truncated?.fullOutputPath.endsWith(".md")).toBe(true)
  expect(readFileSync(meta.truncated!.fullOutputPath, "utf8")).toBe(full)
})

test("character and single-line limits save complete Unicode and JSON values", async () => {
  const unicode = await call("/long-line")
  expect(unicode.meta.truncated).toBeDefined()
  expect(readFileSync(unicode.meta.truncated!.fullOutputPath, "utf8")).toBe("😀".repeat(2000))
  const json = await call("/long-json")
  expect(json.meta.truncated?.fullOutputPath.endsWith(".json")).toBe(true)
  expect(JSON.parse(readFileSync(json.meta.truncated!.fullOutputPath, "utf8"))).toEqual({
    text: "x".repeat(60_000),
  })
})

test("HTTP errors, empty shells, and magic-byte attachments retain useful metadata", async () => {
  const [missing, shell] = await Promise.all([call("/missing"), call("/shell")])
  expect(missing.meta).toMatchObject({ ok: false, status: 404 })
  expect(shell.meta.warning).toContain("JavaScript")
  const image = await call("/image")
  expect(image.parts.some((part) => part.type === "image")).toBe(true)
  expect(image.text).toBeUndefined()
})
