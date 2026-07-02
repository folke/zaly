import type { Message, Usage } from "@zaly/ai"

import { describe, expect, test } from "vitest"
import {
  extractBashUsage,
  extractConversation,
  extractFileUsage,
  formatBashUsage,
  formatFileUsage,
  messageTail,
} from "../src/compaction/utils.ts"
import { MemoryStore, Session } from "../src/session/index.ts"

const u = (text: string): Message => ({ content: text, role: "user" })
const a = (text: string): Message => ({ content: text, role: "assistant" })

/** Build a started session and seed a script of `[message, usage?]`
 *  pairs. Usage is attached to the assistant message's `meta.usage` so
 *  `messageTail` can read it directly off the message. */
async function build(
  script: readonly (readonly [Message, Usage?])[]
): Promise<{ session: Session; messages: Message[] }> {
  const session = await Session.load({ store: new MemoryStore() })
  await session.start()
  for (const [m, usage] of script) {
    const msg: Message = usage && m.role === "assistant" ? { ...m, meta: { ...m.meta, usage } } : m
    await session.add(msg)
  }
  return { messages: [...session.messages], session }
}

const usage = (input: number, output = 0, extra: Partial<Usage> = {}): Usage => ({
  input,
  output,
  ...extra,
})

describe("compaction usage extraction", () => {
  test("extractFileUsage tallies read/write/edit counts and supports sort/filter options", () => {
    const messages: Message[] = [
      { content: "u1", role: "user" },
      {
        content: [
          {
            content: "read",
            id: "r1",
            meta: { full: true, path: "a.ts" },
            name: "read",
            type: "tool-result",
          },
        ],
        role: "tool",
        ts: 100,
      },
      {
        content: [
          {
            content: "write",
            id: "w1",
            meta: { path: "a.ts" },
            name: "write",
            type: "tool-result",
          },
          { content: "edit", id: "e1", meta: { path: "b.ts" }, name: "edit", type: "tool-result" },
          { content: "ignored", id: "x", name: "read", type: "tool-result" },
        ],
        role: "tool",
        ts: 200,
      },
    ]

    expect(extractFileUsage(messages, { sort: "key" })).toMatchObject([
      { count: 2, edits: 0, lastTs: 200, path: "a.ts", reads: 1, writes: 1 },
      { count: 1, edits: 1, lastTs: 200, path: "b.ts", reads: 0, writes: 0 },
    ])
    expect(extractFileUsage(messages, { minCount: 2 })).toHaveLength(1)
    expect(extractFileUsage(messages, { limit: 1 })).toHaveLength(1)
  })

  test("extractBashUsage parses commands, filters plumbing, and formats results", () => {
    const messages: Message[] = [
      {
        content: [
          {
            id: "b1",
            name: "bash",
            params: { command: "cat file && bun test" },
            type: "tool-call",
          },
          { id: "b2", name: "bash", params: { command: "bun test" }, type: "tool-call" },
          { id: "b3", name: "bash", params: { command: "echo 'a\\nb'" }, type: "tool-call" },
          { id: "b4", name: "bash", params: "not json", type: "tool-call" },
        ],
        role: "assistant",
        ts: 300,
      },
    ]

    const bashUsage = extractBashUsage(messages)
    expect(bashUsage).toMatchObject([{ command: "bun test", count: 2, lastTs: 300, lastTurn: 1 }])
    expect(formatBashUsage(bashUsage)).toContain("<bash-commands>")
    expect(formatBashUsage([])).toBe("(no bash commands found)")
  })

  test("extractConversation flattens and sanitizes messages for summarization", () => {
    const conversation = extractConversation(
      [
        u("hello"),
        {
          content: [
            { text: "thinking", type: "reasoning" },
            { id: "call", name: "read", params: { path: "a.ts" }, type: "tool-call" },
          ],
          role: "assistant",
        },
        {
          content: [
            {
              content: "0123456789",
              id: "call",
              isError: true,
              name: "read",
              type: "tool-result",
            },
          ],
          role: "tool",
        },
        { content: [{ code: "NOPE", message: "bad", type: "error" }], role: "user" },
      ],
      { maxToolResultLen: 4 }
    )

    expect(conversation).toContain("<conversation>")
    expect(conversation).toContain("[User]: hello")
    expect(conversation).toContain("<tool-call>read")
    expect(conversation).toContain('<tool-result>\n  {"tool":"read","error":true}')
    expect(conversation).toContain("0123…")
    expect(conversation).not.toContain("thinking")
    expect(conversation).toContain("<error>")
  })

  test("formatFileUsage formats empty and populated file tables", () => {
    expect(formatFileUsage([])).toBe("(no file ops found)")
    expect(
      formatFileUsage([
        {
          count: 3,
          edits: 1,
          lastTs: 0,
          lastTurn: Infinity,
          path: "a.ts",
          reads: 1,
          score: 2.5,
          writes: 1,
        },
      ])
    ).toContain("<files>")
  })
})

describe("messageTail", () => {
  test("empty session returns empty tail", async () => {
    const { session } = await build([])
    expect(messageTail(session.messages, { keepTokens: 1000 })).toEqual([])
  })

  test("messages with no usage are queued and never flushed", async () => {
    const { session } = await build([[u("hi")], [u("again")]])
    expect(messageTail(session.messages, { keepTokens: 1000 })).toEqual([])
  })

  test("newest assistant always admitted (delta = 0 by definition)", async () => {
    const { session, messages } = await build([[a("greeting"), usage(50, 10)]])
    expect(messageTail(session.messages, { keepTokens: 0 })).toEqual(messages)
  })

  test("leading user without later assistant is dropped (queue never flushes)", async () => {
    const { session, messages } = await build([[u("q1")], [a("a1"), usage(50, 10)]])
    const tail = messageTail(session.messages, { keepTokens: 1000 })
    expect(tail).toEqual([messages[1]])
  })

  test("budget allows entire post-first-user chain", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(110, 20)],
      [u("q3")],
      [a("a3"), usage(180, 20)],
    ])
    const tail = messageTail(session.messages, { keepTokens: 1000 })
    expect(tail).toEqual(messages.slice(1))
  })

  test("budget cuts mid-chain on growth boundary", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(110, 20)],
      [u("q3")],
      [a("a3"), usage(180, 20)],
    ])
    const tail = messageTail(session.messages, { keepTokens: 100 })
    expect(tail).toEqual(messages.slice(3))
  })

  test("multiple users between assistants ride along together", async () => {
    const { session, messages } = await build([
      [a("a1"), usage(40, 10)],
      [u("q2-a")],
      [u("q2-b")],
      [u("q2-c")],
      [a("a2"), usage(120, 20)],
    ])
    expect(messageTail(session.messages, { keepTokens: 1000 })).toEqual(messages)
    expect(messageTail(session.messages, { keepTokens: 50 })).toEqual([messages[4]])
  })

  test("masker-style shrink — clamp prevents under-charge of newer growth", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 10, { cacheRead: 200 })],
      [u("q2")],
      [a("a2"), usage(60, 20)],
      [u("q3")],
      [a("a3"), usage(180, 20)],
    ])
    const tail = messageTail(session.messages, { keepTokens: 50 })
    expect(tail).toEqual(messages.slice(5))
  })

  test("masker-style shrink — clamp does not let walk consume infinite history", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 50, { cacheRead: 100 })],
      [u("q2")],
      [a("a2"), usage(40, 20)],
      [u("q3")],
      [a("a3"), usage(60, 20)],
      [u("q4")],
      [a("a4"), usage(80, 20)],
    ])
    const tail = messageTail(session.messages, { keepTokens: 30 })
    expect(tail).toEqual(messages.slice(5))
  })

  test("cache fields contribute to current — high cacheRead inflates the delta", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(70, 20, { cacheRead: 500, cacheWrite: 100 })],
    ])
    const tail = messageTail(session.messages, { keepTokens: 100 })
    expect(tail).toEqual([messages[3]])
  })

  test("opts.messages overrides session.messages — used for masked agent view", async () => {
    const { messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(110, 20)],
    ])
    const masked: Message[] = messages.map((m) => structuredClone(m))
    const tail = messageTail(masked, { keepTokens: 1000 })
    expect(tail).toEqual(masked.slice(1))
    expect(tail.every((m, i) => m === masked[i + 1])).toBe(true)
  })

  test("default budget kicks in when maxTokens is omitted (20k)", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(100, 50)],
      [u("q2")],
      [a("a2"), usage(200, 50)],
    ])
    expect(messageTail(session.messages, {})).toEqual(messages.slice(1))
  })
})
