import type { ToolResult } from "@zaly/ai"

import { stripAnsi } from "@zaly/shared/ansi"
import { createCtx } from "@zaly/tui"
import { expect, test } from "vitest"
import { ToolView } from "../src/widgets/tool.ts"
import { toolRenderer } from "../src/widgets/tools/registry.ts"

async function render(content: ToolResult["content"], width = 100) {
  const view = new ToolView({
    call: {
      id: "search",
      name: "session_search",
      params: { pattern: "example" },
      type: "tool-call",
    },
    cwd: process.cwd(),
    result: { content },
  })
  const ctx = await createCtx({ width })
  const rows = await toolRenderer("session_search").result(view).render(ctx)
  view.close()
  return rows.map((line) => stripAnsi(line).trimEnd())
}

function row(id: string, role: string, message: string) {
  return JSON.stringify({ id, message, role })
}

test("session search renders Markdown with role labels and dividers, without IDs", async () => {
  const rows = await render([
    {
      text: `${row("msg-1", "assistant", "**Example**\n\nSecond paragraph")}\n${row("msg-2", "user", "Next")}`,
      type: "text",
    },
    { data: { more: true }, tag: "session_search", type: "meta" },
  ])
  const text = rows.join("\n")
  expect(text).toContain("Assistant: Example")
  expect(text).toMatch(/Second paragraph\n\n +─+\n\n +User: Next/)
  expect(text).not.toContain("msg-1")
  expect(text).not.toContain("msg-2")
  expect(text).not.toContain('"message":')
  expect(text).not.toContain("More matches omitted")
})

test("session search caps the preview after Markdown wraps to the terminal width", async () => {
  const rows = await render(row("msg-1", "tool", `${"example ".repeat(60)}end marker`), 30)
  expect(rows).toHaveLength(16)
  expect(rows[0]).toContain("Tool: example")
  expect(rows[15]).toMatch(/\+\d+ more lines/)
  expect(rows.join("\n")).not.toContain("end marker")
})

test("session search handles empty and legacy results", async () => {
  expect(await render("")).toEqual([" No matches found."])
  const legacy = await render('{"matches":[]}')
  expect(legacy.join("\n")).toContain('"matches":[]')
})
