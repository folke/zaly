import type { Message } from "@zaly/ai"
import type { Agent } from "../src/agent.ts"

import { describe, expect, test, vi } from "vitest"
import { Masker } from "../src/masker.ts"

const user = (id: string, content: Message<"user">["content"]): Message<"user"> => ({
  content,
  id,
  role: "user",
})
const assistant = (
  id: string,
  content: Message<"assistant">["content"] = "ok"
): Message<"assistant"> => ({
  content,
  id,
  role: "assistant",
})
const tool = (id: string, content: Message<"tool">["content"]): Message<"tool"> => ({
  content,
  id,
  role: "tool",
})

type FakeAgent = Agent & {
  $ctxOn: ReturnType<typeof vi.fn>
  $on: ReturnType<typeof vi.fn>
  session: {
    maskCheckpoint?: { messageId: string; threshold: number }
    addMaskCheckpoint: ReturnType<typeof vi.fn>
  }
}

function fakeAgent(): FakeAgent {
  const session = {
    maskCheckpoint: undefined as { messageId: string; threshold: number } | undefined,
    addMaskCheckpoint: vi.fn(async (checkpoint: { messageId: string; threshold: number }) => {
      session.maskCheckpoint = checkpoint
    }),
  }
  const on = vi.fn()
  const ctxOn = vi.fn()
  return {
    $ctxOn: ctxOn,
    $on: on,
    ctx: { on: ctxOn },
    on,
    pressure: { limit: 1000, ratio: 1 },
    prompt: [],
    session,
    tools: [],
  } as unknown as FakeAgent
}

describe("Masker", () => {
  test("registers agent hooks and resets masks on session events", async () => {
    const agent = fakeAgent()
    const masker = new Masker(agent, { keepTurns: 0 })
    expect(agent.$on).toHaveBeenCalledWith("context", expect.any(Function))
    expect(agent.$ctxOn).toHaveBeenCalledWith("session", expect.any(Function))
    expect(masker.enabled).toBe(true)
  })

  test("disabled masker returns an unmodified copy and reports no masks", async () => {
    const agent = fakeAgent()
    const masker = new Masker(agent, { enabled: false })
    const messages = [user("u1", "hello")]

    const projected = await masker.mask(messages, { force: true })
    expect(projected).toEqual(messages)
    expect(projected).not.toBe(messages)
    expect(masker.enabled).toBe(false)
    expect(masker.masked).toBe(0)
    expect(masker.isMasked("u1")).toBe(false)
  })

  test("force masking replaces low-value old attachments and records stats/checkpoint", async () => {
    const agent = fakeAgent()
    const masker = new Masker(agent, { keepTurns: 0, minTokens: 1, target: 0.1 })
    const messages: Message[] = [
      user("u1", [{ mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" }]),
      assistant("a1"),
    ]

    const projected = await masker.mask(messages, { force: true, limit: 1000, ratio: 1 })

    expect(agent.session.addMaskCheckpoint).toHaveBeenCalledWith({
      messageId: "a1",
      threshold: 0.35,
    })
    expect(masker.masked).toBe(1)
    expect(masker.isMasked("u1")).toBe(true)
    expect(masker.isMasked("u1", 0)).toBe(true)
    expect(masker.stats.get("user")).toEqual({ image: 1 })
    expect(projected[0]).not.toBe(messages[0])
    expect(projected[0].content).toEqual([
      { content: "Masked image. Re-attach to refresh", tag: "masked", type: "meta" },
    ])
    expect(projected[1]).toBe(messages[1])
  })

  test("does not mask recent turns protected by keepTurns", async () => {
    const agent = fakeAgent()
    const masker = new Masker(agent, { keepTurns: 20, minTokens: 1, target: 0.1 })
    const messages: Message[] = [
      user("u1", [{ mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" }]),
      assistant("a1"),
    ]

    const projected = await masker.mask(messages, { force: true, limit: 1000, ratio: 1 })

    expect(masker.masked).toBe(0)
    expect(masker.isMasked("u1")).toBe(false)
    expect(projected).toEqual(messages)
  })

  test("skips tiny tool results under minTokens", async () => {
    const agent = fakeAgent()
    const masker = new Masker(agent, { keepTurns: 0, minTokens: 50, target: 0.1 })
    const messages: Message[] = [
      assistant("a1", [
        { id: "call", name: "bash", params: { command: "true" }, type: "tool-call" },
      ]),
      tool("t1", [{ content: "ok", id: "call", name: "bash", type: "tool-result" }]),
      assistant("a2"),
    ]

    await masker.mask(messages, { force: true, limit: 1000, ratio: 1 })

    expect(masker.masked).toBe(0)
    expect(masker.stats.size).toBe(0)
  })

  test("restores masking decisions from a previous checkpoint", async () => {
    const agent = fakeAgent()
    agent.session.maskCheckpoint = { messageId: "a1", threshold: 0.4 }
    const masker = new Masker(agent, { keepTurns: 0, minTokens: 1, target: 0.1 })
    const messages: Message[] = [
      user("u1", [{ mime: "image/png", source: { data: "abc", type: "base64" }, type: "image" }]),
      assistant("a1"),
      user("u2", [{ mime: "image/png", source: { data: "def", type: "base64" }, type: "image" }]),
      assistant("a2"),
    ]

    const projected = await masker.mask(messages, { limit: 1000, ratio: 0.2 })

    expect(agent.session.addMaskCheckpoint).not.toHaveBeenCalled()
    expect(masker.isMasked("u1", 0)).toBe(true)
    expect(masker.isMasked("u2", 0)).toBe(false)
    expect(projected[0].content).toEqual([
      { content: "Masked image. Re-attach to refresh", tag: "masked", type: "meta" },
    ])
    expect(projected[2]).toBe(messages[2])
  })

  test("throws when a masking pass has no latest message id", async () => {
    const agent = fakeAgent()
    const masker = new Masker(agent, { keepTurns: 0, minTokens: 1 })
    await expect(
      masker.mask([user("u1", "old"), { content: "latest", role: "assistant" }], { force: true })
    ).rejects.toThrow("Message in masker without ID")
  })
})
