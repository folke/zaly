import type { FetchTool, FetchToolMeta } from "@zaly/agent"
import type { ToolResult } from "@zaly/ai"
import type { Reactive } from "@zaly/tui"

import { stripAnsi } from "@zaly/shared/ansi"
import { createCtx, signal } from "@zaly/tui"
import { expect, test } from "vitest"
import { defaultRenderer } from "../src/widgets/tools/default.ts"
import { toolRenderer } from "../src/widgets/tools/registry.ts"

const url = "https://example.com/docs"
function completed(
  meta: Partial<FetchToolMeta> = {},
  content = "# Heading\n\nPage content"
): ToolResult<FetchToolMeta> {
  return {
    content,
    meta: {
      contentType: "text/html",
      durationMs: 10,
      format: "markdown",
      kind: "fetch",
      ok: true,
      status: 200,
      statusText: "OK",
      title: "Documentation",
      type: "text",
      url,
      ...meta,
    },
  }
}
function node(result: Reactive<ToolResult<FetchToolMeta> | undefined>) {
  return toolRenderer<FetchTool>("fetch").result({
    call: { id: "fetch", name: "fetch", params: { url }, type: "tool-call" },
    params: { url },
    result,
  })
}
async function renderRaw(result: ToolResult<FetchToolMeta>) {
  const ctx = await createCtx({ width: 100 })
  const rows = await node(result).render(ctx)
  return rows.join("\n")
}
async function render(result: ToolResult<FetchToolMeta>) {
  return stripAnsi(await renderRaw(result))
}

test("fetch keeps the default call preview", () => {
  expect(toolRenderer<FetchTool>("fetch").call).toBe(defaultRenderer.call)
})

test("fetch preview links the page title to the resolved URL without success-status clutter", async () => {
  const resolvedUrl = "https://example.com/resolved"
  const raw = await renderRaw(completed({ url: resolvedUrl }))
  expect(raw).toContain(`\x1b]8;;${resolvedUrl}\x1b\\`)
  const value = stripAnsi(raw)
  expect(value).toContain("Documentation")
  expect(value).not.toContain(resolvedUrl)
  expect(value).not.toContain("200 OK")
  expect(value).toContain("Heading")
  expect(value).toContain("Page content")
})

test("large fetch results show a compact preview and the saved output path", async () => {
  const value = await render(
    completed(
      {
        truncated: {
          fullOutputPath: "/tmp/fetch-output.md",
          totalBytes: 50_000,
          totalLines: 200,
        },
      },
      Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n")
    )
  )
  expect(value).toContain("line 1")
  expect(value).not.toContain("line 11")
  expect(value).toContain("+10 more lines fetched")
  expect(value).toContain("Full output: /tmp/fetch-output.md (200 lines)")
})

test("remote titles and content cannot emit terminal control commands", async () => {
  const osc = "\x1b]52;c;ZXZpbA==\x07"
  const ctx = await createCtx({ width: 100 })
  const rows = await node(completed({ title: `Title${osc}` }, `Body${osc}`)).render(ctx)
  expect(rows.join("\n")).not.toContain(osc)
  expect(stripAnsi(rows.join("\n"))).toContain("Title")
  expect(stripAnsi(rows.join("\n"))).toContain("Body")
})

test("HTTP errors and conversion warnings stay visible", async () => {
  const value = await render(
    completed({ ok: false, status: 403, statusText: "Forbidden", warning: "Use a browser" })
  )
  expect(value).toContain("403 Forbidden")
  expect(value).toContain("Use a browser")
})

test.each([
  { type: "image", mime: "image/png" },
  { type: "pdf", mime: "application/pdf" },
] as const)(
  "$type attachments fall back to a linked URL without an empty code preview",
  async (attachment) => {
    const result = completed({ type: attachment.type, format: undefined, title: undefined }, "")
    result.content = [{ ...attachment, source: { type: "base64", data: "" } }]
    const raw = await renderRaw(result)
    expect(raw).toContain(`\x1b]8;;${url}\x1b\\`)
    expect(stripAnsi(raw).trim()).toBe(url)
  }
)

test("a pending fetch reacts to its result and legacy text still renders without sidecar metadata", async () => {
  const [result, setResult] = signal<ToolResult<FetchToolMeta> | undefined>(undefined)
  const view = node(result)
  const ctx = await createCtx({ width: 100 })
  let rows = await view.render(ctx)
  expect(stripAnsi(rows.join("\n")).trim()).toBe("")
  setResult(completed())
  rows = await view.render(ctx)
  expect(stripAnsi(rows.join("\n"))).toContain("Page content")
  expect(await render({ content: "Legacy response" })).toContain("Legacy response")
})
