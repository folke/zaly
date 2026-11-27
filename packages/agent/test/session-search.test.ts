import { runTool } from "@zaly/ai"
import { expect, test } from "vitest"
import { Session } from "../src/session/session.ts"
import { sessionSearchTool } from "../src/tools/session-search.ts"
import { loadAgent } from "./helpers.ts"

async function setup() {
  const session = await Session.load()
  const agent = await loadAgent({ session })
  const search = (args: unknown) => runTool(sessionSearchTool, args, { agent })
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
        (line) => JSON.parse(line) as { id: string; role: string; message: string }
      ),
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
  await session.add({ content: "Keep TODO.md untouched.", role: "user" })
  const first = session.head!
  await session.add({ content: "Abandoned TODO.md change", role: "assistant" })
  const abandoned = session.head!
  await session.checkout(first)
  await session.add({ content: "Agreed, no changes to TODO.md.", role: "assistant" })
  const second = session.head!
  await session.compact({ summary: { content: "Summary only", role: "system" }, tail: 0 })
  await session.add({ content: "Still leave TODO.md alone.", role: "user" })
  const third = session.head!
  await session.compact({ summary: { content: "New summary only", role: "system" }, tail: 0 })

  expect(await rows({ pattern: String.raw`todo\.md`, role: "user", limit: 1 })).toEqual({
    messages: [{ id: third, role: "user", message: "Still leave TODO.md alone." }],
    meta: { more: true },
  })
  expect(await rows({ id: second })).toEqual({
    messages: [
      { id: first, role: "user", message: "Keep TODO.md untouched." },
      { id: second, role: "assistant", message: "Agreed, no changes to TODO.md." },
      { id: third, role: "user", message: "Still leave TODO.md alone." },
    ],
    meta: undefined,
  })
  expect(await errorCode({ id: abandoned })).toBe("MESSAGE_NOT_FOUND")
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
  expect(result.messages[0]?.message.length).toBeLessThanOrEqual(602)
  const calls = await rows({ pattern: "example.txt", fixed_strings: true })
  expect(calls.messages[0]?.message).toContain("example.txt")
  for (const pattern of ["not searchable reasoning", "wire marker", "LITERAL"]) {
    expect(await rows({ pattern })).toMatchObject({ messages: [] })
  }
  expect(await rows({ pattern: String.raw`\[needle\]\n\s+"escaped"` })).toEqual(result)
})

test("requires an active session and exactly one lookup mode", async () => {
  const { errorCode } = await setup()
  for (const args of [{}, { pattern: "[" }, { id: "x", pattern: "x" }]) {
    expect(await errorCode(args)).toBe("INVALID_INPUT")
  }
  const result = await runTool(sessionSearchTool, { pattern: "x" }, {})
  expect(result.error?.code).toBe("NO_SESSION")
})
