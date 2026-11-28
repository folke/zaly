import type { ToolContext } from "@zaly/ai"

import { runTool } from "@zaly/ai"
import { expect, test } from "vitest"
import { Session } from "../src/session/session.ts"
import { sessionSearchTool } from "../src/tools/session-search.ts"
import { loadAgent } from "./helpers.ts"

async function setup(ctx: Pick<ToolContext, "messages" | "isMasked"> = {}) {
  const session = await Session.load()
  const agent = await loadAgent({ session })
  const search = (args: unknown) => runTool(sessionSearchTool, args, { ...ctx, agent })
  const rows = async (args: unknown) => {
    const result = await search(args)
    expect(result.isError).toBe(false)
    const parts = typeof result.content === "string" ? [] : result.content
    const text =
      typeof result.content === "string"
        ? result.content
        : (parts.find((p) => p.type === "text")?.text ?? "")
    const lines = text ? text.split("\n") : []
    for (const line of lines) expect(line).toMatch(/^\{"id":/)
    return {
      messages: lines.map(
        (line) =>
          JSON.parse(line) as {
            id: string
            role: string
            message: string
            match?: true
            ts?: string
          }
      ),
      sidecar: result.meta,
      meta: parts.find((p) => p.type === "meta")?.data,
    }
  }
  const errorCode = async (args: unknown) => {
    const result = await search(args)
    return result.error?.code
  }
  return { session, rows, errorCode }
}

test("finds exact old messages and nearby turns on the current branch after repeated compaction", async () => {
  const { session, rows, errorCode } = await setup()
  const ts = Date.UTC(2026, 0, 1)
  const iso = new Date(ts).toISOString()
  await session.add({ content: "Keep TODO.md untouched.", role: "user", ts })
  const first = session.head!
  await session.add({ content: "Abandoned TODO.md change", role: "assistant" })
  const abandoned = session.head!
  await session.checkout(first)
  await session.add({ content: "Agreed, no changes to TODO.md.", role: "assistant", ts })
  const second = session.head!
  await session.compact({ summary: { content: "Summary only", role: "system" }, tail: 0 })
  await session.add({ content: "Still leave TODO.md alone.", role: "user", ts })
  const third = session.head!
  await session.compact({ summary: { content: "New summary only", role: "system" }, tail: 0 })

  expect(await rows({ pattern: String.raw`todo\.md`, role: "user", limit: 1 })).toEqual({
    messages: [
      { id: third, match: true, role: "user", message: "Still leave TODO.md alone.", ts: iso },
    ],
    meta: { already_visible: 0, before: third, more: 1, shown: 1 },
    sidecar: { shown: 1, skipped: 0, total: 2 },
  })
  expect(await rows({ id: second })).toEqual({
    messages: [
      { id: first, role: "user", message: "Keep TODO.md untouched.", ts: iso },
      { id: second, role: "assistant", message: "Agreed, no changes to TODO.md." },
      { id: third, role: "user", message: "Still leave TODO.md alone." },
    ],
    meta: { already_visible: 0, more: 0, shown: 1 },
    sidecar: { shown: 1, skipped: 0, total: 1 },
  })
  expect(await errorCode({ id: abandoned })).toBe("MESSAGE_NOT_FOUND")
  expect(await errorCode({ before: abandoned, pattern: "todo" })).toBe("MESSAGE_NOT_FOUND")
  expect(await rows({ pattern: "Abandoned" })).toMatchObject({ messages: [] })
})

test("searches text and tool records without returning reasoning, wire metadata, or oversized excerpts", async () => {
  const { session, rows } = await setup()
  await session.add({
    content: [
      { type: "reasoning", text: "not searchable reasoning" },
      {
        type: "tool-call",
        id: "r1",
        name: "read",
        params: { path: "example.txt" },
        wire: { data: "wire marker" },
      },
    ],
    role: "assistant",
  })
  await session.add({
    content: [
      {
        type: "tool-result",
        id: "r1",
        name: "read",
        content: `${"x".repeat(3000)}literal [needle]\n"escaped"${"x".repeat(1000)}`,
      },
    ],
    role: "tool",
  })
  const result = await rows({ pattern: "[needle]", fixed_strings: true, role: "tool" })
  expect(result.messages[0]?.message).toContain('literal [needle]\n  "escaped"')
  expect(result.messages[0]?.message.length).toBeLessThanOrEqual(202)
  const calls = await rows({ pattern: "example.txt", fixed_strings: true })
  expect(calls.messages[0]?.message).toContain("example.txt")
  for (const pattern of ["not searchable reasoning", "wire marker", "LITERAL"]) {
    expect(await rows({ pattern })).toMatchObject({ messages: [] })
  }
  expect(await rows({ pattern: String.raw`\[needle\]\n\s+"escaped"` })).toEqual(result)
})

test("requires an active session and exactly one lookup mode", async () => {
  const { errorCode } = await setup()
  for (const args of [{}, { pattern: "[" }, { id: "x", pattern: "x" }, { before: "x", id: "x" }]) {
    expect(await errorCode(args)).toBe("INVALID_INPUT")
  }
  const result = await runTool(sessionSearchTool, { pattern: "x" }, {})
  expect(result.error?.code).toBe("NO_SESSION")
})

test("paginates eligible hits by ID, with distinct context rows and sparse timestamps", async () => {
  const ctx: Pick<ToolContext, "messages"> = { messages: [] }
  const { session, rows, errorCode } = await setup(ctx)
  const base = Date.UTC(2026, 10, 28, 9)
  const hour = 60 * 60 * 1000
  await session.add({ content: "hit oldest", role: "user", ts: base })
  const oldest = session.head!
  await session.add({ content: "nearby", role: "assistant", ts: base + hour })
  const neighbor = session.head!
  await session.add({ content: "hit middle", role: "user", ts: base + hour + 1 })
  const middle = session.head!
  await session.add({ content: "hit newest", role: "user", ts: base + 2 * hour })
  const newest = session.head!
  await session.add({ content: "hit visible", role: "user", ts: base + 3 * hour })
  const visible = session.head!
  ctx.messages = session.messages.filter((m) => m.id === visible)

  const args = { context: 1, limit: 2, pattern: "hit", role: "user" }
  const page = await rows(args)
  expect(page.messages.map(({ id, match, ts }) => [id, match, ts])).toEqual([
    [neighbor, undefined, new Date(base + hour).toISOString()],
    [middle, true, undefined],
    [newest, true, undefined],
  ])
  expect(page.meta).toEqual({ already_visible: 1, before: middle, more: 1, shown: 2 })

  const older = await rows({ ...args, before: middle })
  expect(older.messages.map(({ id, match, ts }) => [id, match, ts])).toEqual([
    [oldest, true, new Date(base).toISOString()],
    [neighbor, undefined, undefined],
  ])
  expect(older.meta).toEqual({ already_visible: 0, more: 0, shown: 1 })
  expect(await errorCode({ id: visible })).toBe("MESSAGE_VISIBLE")

  const all = await rows({ ...args, limit: 3 })
  expect(all.messages.filter((row) => row.ts).map((row) => row.id)).toEqual([oldest, middle])
})

test("an explicit masked ID returns the full stored text", async () => {
  const ctx: Pick<ToolContext, "messages" | "isMasked"> = { isMasked: () => true }
  const { session, rows } = await setup(ctx)
  const message = "original ".repeat(700).trim()
  await session.add({ content: message, role: "user" })
  ctx.messages = session.messages
  const result = await rows({ context: 0, id: session.head })
  expect(result.messages[0]?.message).toBe(message)
  expect(result.meta).toEqual({ already_visible: 0, more: 0, shown: 1 })
})
