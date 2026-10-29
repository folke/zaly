import type { ReadTool, ReadToolMeta } from "@zaly/agent"
import type { ParamsOf, ToolResult } from "@zaly/ai"

import { stripAnsi } from "@zaly/shared/ansi"
import { createCtx } from "@zaly/tui"
import { join } from "pathe"
import { expect, test } from "vitest"
import { toolCall, ToolView } from "../src/widgets/tool.ts"
import { toolRenderer } from "../src/widgets/tools/registry.ts"

function call(params: Partial<ParamsOf<ReadTool>>, result?: ToolResult<ReadToolMeta>) {
  const args = { path: "file.ts", ...params }
  return toolRenderer<ReadTool>("read").call(
    new ToolView<ReadTool>({
      cwd: process.cwd(),
      call: { id: "read", name: "read", params: args, type: "tool-call" },
      result,
    })
  )
}

function completed(meta: Partial<ReadToolMeta> = {}): ToolResult<ReadToolMeta> {
  return {
    content: "read content",
    meta: { kind: "read", path: "file.ts", mtime: 0, offset: 8, limit: 23, full: false, ...meta },
  }
}

test.each([
  [{}, ""],
  [{ offset: 8, limit: 23 }, " 8–30"],
  [{ limit: 10 }, " 1–10"],
  [{ offset: 8 }, " 8–…"],
  [{ offset: 0, limit: 2 }, " 1–2"],
  [{ offset: -50 }, " last 50 lines"],
  [{ offset: -1 }, " last 1 line"],
  [{ offset: -50, limit: 20 }, " 50 from end · 20 lines"],
  [{ offset: -50, limit: 100 }, " last 50 lines"],
] satisfies [Partial<ParamsOf<ReadTool>>, string][])(
  "pending read %j shows requested range",
  async (params, suffix) => {
    const ctx = await createCtx({ width: 100 })
    const rows = await call(params).render(ctx)
    expect(stripAnsi(rows.join("\n")).trimEnd()).toBe(`read("file.ts")${suffix}`)
  }
)

test.each([
  [{ offset: 8, limit: 5 }, " 8–12"],
  [{ offset: 151, limit: 50 }, " 151–200"],
  [{ offset: 1, limit: 2000 }, " 1–2000"],
  [{ full: true }, ""],
  [{ unchanged: true, offset: 0, limit: 0 }, ""],
  [{ offset: 201, limit: 0 }, " no lines"],
] satisfies [Partial<ReadToolMeta>, string][])(
  "completed read uses actual metadata %j",
  async (meta, suffix) => {
    const ctx = await createCtx({ width: 100 })
    const rows = await call({ offset: -50, limit: 2000 }, completed(meta)).render(ctx)
    expect(stripAnsi(rows.join("\n")).trimEnd()).toBe(`read("file.ts")${suffix}`)
  }
)

test.each([
  { type: "image", mime: "image/png" },
  { type: "pdf", mime: "application/pdf" },
] as const)("completed $type reads omit line ranges", async (attachment) => {
  const ctx = await createCtx({ width: 100 })
  const rows = await call(
    { offset: 8, limit: 23 },
    {
      content: [
        {
          ...attachment,
          source: { type: "base64", data: "" },
        },
      ],
    }
  ).render(ctx)
  expect(stripAnsi(rows.join("\n")).trimEnd()).toBe('read("file.ts")')
})

test("failed reads omit requested ranges", async () => {
  const ctx = await createCtx({ width: 100 })
  const rows = await call({ offset: 8, limit: 23 }, { content: "not found", isError: true }).render(
    ctx
  )
  expect(stripAnsi(rows.join("\n")).trimEnd()).toBe('read("file.ts")')
})

test("read range reacts to completion and clamps to EOF even when the result is collapsed", async () => {
  const view = new ToolView<ReadTool>({
    cwd: process.cwd(),
    call: {
      id: "read",
      name: "read",
      type: "tool-call",
      params: { path: "file.ts", offset: 8, limit: 100 },
    },
    collapsed: true,
  })
  const node = toolCall(view)
  const ctx = await createCtx({ width: 100 })
  let rows = await node.render(ctx)
  expect(stripAnsi(rows.join("\n"))).toContain('read("file.ts") 8–107')

  view.result = completed({ offset: 8, limit: 23 })
  rows = await node.render(ctx)
  expect(stripAnsi(rows.join("\n"))).toContain('read("file.ts") 8–30')
  expect(stripAnsi(rows.join("\n"))).not.toContain("read content")
})

test.each(["read", "edit", "write"] as const)(
  "%s preview reacts to the resolved file path",
  async (name) => {
    const view = new ToolView({
      cwd: process.cwd(),
      call: { id: name, name, type: "tool-call", params: { path: "./folder/../file.ts" } },
      collapsed: true,
    })
    const node = toolCall(view)
    const ctx = await createCtx({ width: 100 })
    let rows = await node.render(ctx)
    expect(stripAnsi(rows.join("\n"))).toContain(`${name}("./folder/../file.ts")`)

    view.result = completed({ kind: name, path: join(process.cwd(), "file.ts"), full: true })
    rows = await node.render(ctx)
    expect(stripAnsi(rows.join("\n"))).toContain(`${name}("file.ts")`)
    expect(stripAnsi(rows.join("\n"))).not.toContain("folder/..")
  }
)

test.each([40, 80])("read range stays visible beside a long path at width %i", async (width) => {
  const ctx = await createCtx({ width })
  const node = call({
    path: "packages/very-long-directory/another-long-directory/interactive.test.ts",
    offset: 8,
    limit: 23,
  })
  const rows = await node.render(ctx)
  expect(rows).toHaveLength(1)
  expect(stripAnsi(rows[0]).trimEnd()).toMatch(/8–30$/)
  expect(stripAnsi(rows[0]).length).toBeLessThanOrEqual(width)
})
