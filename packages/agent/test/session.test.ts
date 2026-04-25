import type { Message } from "@zaly/ai"
import type { SessionEvent, SessionNode } from "../src/session.ts"

import { describe, expect, test } from "vitest"
import { Session } from "../src/session.ts"

const u = (text: string): Message => ({ content: text, role: "user" })
const a = (text: string): Message => ({ content: text, role: "assistant" })

describe("Session — basics", () => {
  test("seeds with a session-start node and an empty messages list", () => {
    const s = new Session()
    expect(s.messages).toEqual([])
    expect(s.head).toBeDefined()
    const start = s.nodes.get(s.head!)
    expect(start?.type).toBe("session-start")
    expect(start?.parentUuid).toBeUndefined()
  })

  test("seeds prompt + modelId on session-start", () => {
    const s = new Session({ modelId: "openai/gpt-4o", prompt: ["be brief"] })
    const start = s.nodes.get(s.head!) as Extract<SessionNode, { type: "session-start" }>
    expect(start.prompt).toEqual(["be brief"])
    expect(start.modelId).toBe("openai/gpt-4o")
  })

  test("initialMessages are added in order, head advances", () => {
    const s = new Session({ initialMessages: [u("hi"), a("hello")] })
    expect(s.messages).toEqual([u("hi"), a("hello")])
    expect(s.nodes.size).toBe(3) // session-start + 2 messages
  })
})

describe("Session — add", () => {
  test("appends with parentUuid pointing at previous head", () => {
    const s = new Session()
    const startId = s.head!
    const u1 = s.add(u("hi"))
    const u2 = s.add(u("again"))
    expect(s.nodes.get(u1)?.parentUuid).toBe(startId)
    expect(s.nodes.get(u2)?.parentUuid).toBe(u1)
    expect(s.head).toBe(u2)
  })

  test("emits one node event per message in order", () => {
    const s = new Session()
    const seen: string[] = []
    s.on("node", (e) => {
      if (e.node.type === "message") seen.push((e.node.message as { content: string }).content)
    })
    s.add(u("a"))
    s.add(u("b"))
    s.add(u("c"))
    expect(seen).toEqual(["a", "b", "c"])
  })
})

describe("Session — compact", () => {
  test("compaction marks a boundary; subsequent adds form the new active chain", () => {
    const s = new Session({ initialMessages: [u("old"), a("older")] })
    expect(s.messages).toHaveLength(2)
    s.compact({ preTokens: 12_000, trigger: "auto" })
    expect(s.messages).toEqual([])
    s.add(u("fresh"))
    expect(s.messages).toEqual([u("fresh")])
    // pre-compact nodes still in the DAG (history)
    expect(s.nodes.size).toBe(5) // start + 2 old + compact + 1 new
  })

  test("compact node carries the metadata", () => {
    const s = new Session()
    s.add(u("hi"))
    const compactId = s.compact({ durationMs: 87, preTokens: 9000, trigger: "manual" })
    const node = s.nodes.get(compactId)!
    expect(node.type).toBe("compact")
    if (node.type !== "compact") throw new Error("expected compact node")
    expect(node.preTokens).toBe(9000)
    expect(node.durationMs).toBe(87)
    expect(node.trigger).toBe("manual")
  })
})

describe("Session — navigate", () => {
  test("navigating to an older node truncates active to that node's chain", () => {
    const s = new Session()
    const u1 = s.add(u("first"))
    s.add(u("second"))
    s.add(u("third"))
    s.navigate(u1)
    expect(s.head).toBe(u1)
    expect(s.messages).toEqual([u("first")])
  })

  test("navigating then adding creates a new branch — pre-navigate messages stay in nodes", () => {
    const s = new Session()
    const u1 = s.add(u("first"))
    s.add(u("alt"))
    const u3 = s.add(u("alt2"))
    expect(s.nodes.size).toBe(4)
    s.navigate(u1)
    s.add(u("branched"))
    expect(s.messages).toEqual([u("first"), u("branched")])
    // u3 still in nodes — it's the head of the abandoned branch
    expect(s.nodes.get(u3)).toBeDefined()
    expect(s.nodes.size).toBe(5)
  })

  test("navigate(undefined) returns to root", () => {
    const s = new Session({ initialMessages: [u("hi"), u("there")] })
    s.navigate(undefined)
    expect(s.head).toBeUndefined()
    expect(s.messages).toEqual([])
  })

  test("navigate emits a navigate event with the new messages snapshot", () => {
    const s = new Session({ initialMessages: [u("a"), u("b"), u("c")] })
    const messageIds: string[] = []
    for (const [uuid, node] of s.nodes) {
      if (node.type === "message") messageIds.push(uuid)
    }
    const bUuid = messageIds[1] // chain: a → b → c; navigate to b
    let captured: Extract<SessionEvent, { type: "navigate" }> | undefined
    s.on("navigate", (e) => {
      captured = e
    })
    s.navigate(bUuid)
    expect(captured?.head).toBe(bUuid)
    expect(captured?.messages.length).toBeLessThan(3)
  })

  test("navigating to an unknown uuid throws", () => {
    const s = new Session()
    expect(() => s.navigate("not-a-real-uuid")).toThrow(/unknown uuid/)
  })
})
