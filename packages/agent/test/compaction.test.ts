import type { Message, Usage } from "@zaly/ai"

import { describe, expect, test } from "vitest"
import { messageTail } from "../src/compaction/utils.ts"
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
    const msg: Message =
      usage && m.role === "assistant" ? { ...m, meta: { ...m.meta, usage } } : m
    await session.add(msg)
  }
  return { messages: [...session.messages], session }
}

const usage = (input: number, output = 0, extra: Partial<Usage> = {}): Usage => ({
  input,
  output,
  ...extra,
})

describe("messageTail", () => {
  test("empty session returns empty tail", async () => {
    const { session } = await build([])
    expect(
      await messageTail({ messages: session.messages, session }, { keepTokens: 1000 })
    ).toEqual([])
  })

  test("messages with no usage are queued and never flushed", async () => {
    const { session } = await build([[u("hi")], [u("again")]])
    expect(
      await messageTail({ messages: session.messages, session }, { keepTokens: 1000 })
    ).toEqual([])
  })

  test("newest assistant always admitted (delta = 0 by definition)", async () => {
    const { session, messages } = await build([[a("greeting"), usage(50, 10)]])
    expect(await messageTail({ messages: session.messages, session }, { keepTokens: 0 })).toEqual(
      messages
    )
  })

  test("leading user without later assistant is dropped (queue never flushes)", async () => {
    const { session, messages } = await build([[u("q1")], [a("a1"), usage(50, 10)]])
    const tail = await messageTail({ messages: session.messages, session }, { keepTokens: 1000 })
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
    const tail = await messageTail({ messages: session.messages, session }, { keepTokens: 1000 })
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
    const tail = await messageTail({ messages: session.messages, session }, { keepTokens: 100 })
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
    expect(
      await messageTail({ messages: session.messages, session }, { keepTokens: 1000 })
    ).toEqual(messages)
    expect(await messageTail({ messages: session.messages, session }, { keepTokens: 50 })).toEqual([
      messages[4],
    ])
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
    const tail = await messageTail({ messages: session.messages, session }, { keepTokens: 50 })
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
    const tail = await messageTail({ messages: session.messages, session }, { keepTokens: 30 })
    expect(tail).toEqual(messages.slice(5))
  })

  test("cache fields contribute to current — high cacheRead inflates the delta", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(70, 20, { cacheRead: 500, cacheWrite: 100 })],
    ])
    const tail = await messageTail({ messages: session.messages, session }, { keepTokens: 100 })
    expect(tail).toEqual([messages[3]])
  })

  test("opts.messages overrides session.messages — used for masked agent view", async () => {
    const { session, messages } = await build([
      [u("q1")],
      [a("a1"), usage(50, 10)],
      [u("q2")],
      [a("a2"), usage(110, 20)],
    ])
    const masked: Message[] = messages.map((m) => structuredClone(m))
    const tail = await messageTail({ messages: masked, session }, { keepTokens: 1000 })
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
    expect(await messageTail({ messages: session.messages, session }, {})).toEqual(
      messages.slice(1)
    )
  })
})
