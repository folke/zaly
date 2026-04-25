import type { Message } from "@zaly/ai"
import type { SessionEvent, SessionNode, SessionOptions } from "../src/session.ts"

import { describe, expect, test } from "vitest"
import { Session } from "../src/session.ts"

const u = (text: string): Message => ({ content: text, role: "user" })
const a = (text: string): Message => ({ content: text, role: "assistant" })

/** Build a started session with optional seed messages — replaces the
 *  old `initialMessages` constructor convenience for tests. */
function startedSession(opts?: SessionOptions, init?: Message[]): Session {
  const s = new Session(opts)
  s.start()
  for (const m of init ?? []) s.add(m)
  return s
}

describe("Session — basics", () => {
  test("constructor leaves the session unstarted (no nodes, undefined head)", () => {
    const s = new Session()
    expect(s.messages).toEqual([])
    expect(s.head).toBeUndefined()
    expect(s.nodes.size).toBe(0)
  })

  test("start() seeds the session-start node with given metadata", () => {
    const s = new Session()
    s.start({ modelId: "openai/gpt-4o", prompt: ["be brief"] })
    const start = s.nodes.get(s.head!) as Extract<SessionNode, { type: "session-start" }>
    expect(start.type).toBe("session-start")
    expect(start.parentUuid).toBeUndefined()
    expect(start.prompt).toEqual(["be brief"])
    expect(start.modelId).toBe("openai/gpt-4o")
  })

  test("start() is idempotent — second call is a no-op", () => {
    const s = new Session()
    s.start({ modelId: "first" })
    const firstHead = s.head
    s.start({ modelId: "second" })
    expect(s.head).toBe(firstHead)
    const start = s.nodes.get(s.head!) as Extract<SessionNode, { type: "session-start" }>
    expect(start.modelId).toBe("first")
  })

  test("messages can be added in order after start()", () => {
    const s = new Session()
    s.start()
    s.add(u("hi"))
    s.add(a("hello"))
    expect(s.messages).toEqual([u("hi"), a("hello")])
    expect(s.nodes.size).toBe(3) // session-start + 2 messages
  })
})

describe("Session — add", () => {
  test("appends with parentUuid pointing at previous head", () => {
    const s = startedSession()
    const startId = s.head!
    const u1 = s.add(u("hi"))
    const u2 = s.add(u("again"))
    expect(s.nodes.get(u1)?.parentUuid).toBe(startId)
    expect(s.nodes.get(u2)?.parentUuid).toBe(u1)
    expect(s.head).toBe(u2)
  })

  test("emits one node event per message in order", () => {
    const s = startedSession()
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
    const s = startedSession(undefined, [u("old"), a("older")])
    expect(s.messages).toHaveLength(2)
    s.compact({ preTokens: 12_000, trigger: "auto" })
    expect(s.messages).toEqual([])
    s.add(u("fresh"))
    expect(s.messages).toEqual([u("fresh")])
    // pre-compact nodes still in the DAG (history)
    expect(s.nodes.size).toBe(5) // start + 2 old + compact + 1 new
  })

  test("compact node carries the metadata", () => {
    const s = startedSession()
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
    const s = startedSession()
    const u1 = s.add(u("first"))
    s.add(u("second"))
    s.add(u("third"))
    s.navigate(u1)
    expect(s.head).toBe(u1)
    expect(s.messages).toEqual([u("first")])
  })

  test("navigating then adding creates a new branch — pre-navigate messages stay in nodes", () => {
    const s = startedSession()
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
    const s = startedSession(undefined, [u("hi"), u("there")])
    s.navigate(undefined)
    expect(s.head).toBeUndefined()
    expect(s.messages).toEqual([])
  })

  test("navigate emits a navigate event with the new messages snapshot", () => {
    const s = startedSession(undefined, [u("a"), u("b"), u("c")])
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

describe("Session — history", () => {
  test("returns empty when there's nothing past the active chain", () => {
    const s = startedSession(undefined, [u("hi"), a("hello")])
    expect(s.history()).toEqual([])
  })

  test("returns pre-compact messages, chronological", () => {
    const s = startedSession()
    s.add(u("old1"))
    s.add(a("old2"))
    s.compact()
    s.add(u("fresh"))
    expect(s.messages).toEqual([u("fresh")])
    expect(s.history()).toEqual([u("old1"), a("old2")])
  })

  test("walks past multiple compacts and returns everything before active", () => {
    const s = startedSession()
    s.add(u("a1"))
    s.compact()
    s.add(u("a2"))
    s.compact()
    s.add(u("a3"))
    expect(s.messages).toEqual([u("a3")])
    expect(s.history()).toEqual([u("a1"), u("a2")])
  })

  test("limit truncates from the front (oldest), keeps the most recent history", () => {
    const s = startedSession()
    s.add(u("oldest"))
    s.add(u("middle"))
    s.add(u("newest"))
    s.compact()
    s.add(u("active"))
    expect(s.history(2)).toEqual([u("middle"), u("newest")])
    expect(s.history(1)).toEqual([u("newest")])
  })

  test("when active is empty, history walks back from head (the compact)", () => {
    const s = startedSession()
    s.add(u("a"))
    s.add(u("b"))
    s.compact()
    expect(s.messages).toEqual([])
    expect(s.history()).toEqual([u("a"), u("b")])
  })
})

function tmpPath(name: string): string {
  return `${process.env.TMPDIR ?? "/tmp"}/zaly-session-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}.jsonl`
}

describe("Session — JSONL persistence", () => {
  const path = tmpPath

  test("writes one record per node and round-trips via load", async () => {
    const file = path("roundtrip")
    const s = new Session({ path: file })
    s.start({ modelId: "openai/gpt-4o", prompt: ["be brief"] })
    s.add(u("hi"))
    const aId = s.add(a("hello"), { modelId: "openai/gpt-4o", usage: { input: 5, output: 2 } })
    s.add(u("again"))
    await s.close()

    const loaded = await Session.load(file)
    expect(loaded.head).toBe(s.head)
    expect(loaded.messages).toEqual(s.messages)
    expect(loaded.nodes.size).toBe(s.nodes.size)
    // Metadata round-trips on the assistant node
    const aNode = loaded.nodes.get(aId)!
    if (aNode.type !== "message") throw new Error("expected message node")
    expect(aNode.usage).toEqual({ input: 5, output: 2 })
    expect(aNode.modelId).toBe("openai/gpt-4o")
    await loaded.close()
  })

  test("compact + post-compact messages survive a round-trip", async () => {
    const file = path("compact")
    const s = new Session({ path: file })
    s.start()
    s.add(u("old1"))
    s.add(a("old2"))
    s.compact({ preTokens: 50, trigger: "auto" })
    s.add(u("fresh"))
    await s.close()

    const loaded = await Session.load(file)
    // Active chain stops at the compact, so only "fresh" is visible.
    expect(loaded.messages).toEqual([u("fresh")])
    // Pre-compact records still in the DAG (history).
    expect(loaded.nodes.size).toBe(5) // start + 2 old + compact + 1 fresh
  })

  test("load picks the latest record as head by default", async () => {
    const file = path("latest")
    const s = new Session({ path: file })
    s.start()
    s.add(u("a"))
    s.add(u("b"))
    const lastHead = s.head
    await s.close()

    const loaded = await Session.load(file)
    expect(loaded.head).toBe(lastHead)
  })

  test("load(path, { fromUuid }) navigates to a branch head", async () => {
    const file = path("branch")
    const s = new Session({ path: file })
    s.start()
    s.add(u("first"))
    const branchPoint = s.head!
    s.add(u("alt-future"))
    await s.close()

    const loaded = await Session.load(file, { fromUuid: branchPoint })
    expect(loaded.head).toBe(branchPoint)
    expect(loaded.messages).toEqual([u("first")])
  })

  test("load tolerates a truncated last line (crash mid-write)", async () => {
    const file = path("truncated")
    const s = new Session({ path: file })
    s.start()
    s.add(u("ok"))
    await s.close()

    // Append a partial JSON line — what a crash mid-write would leave.
    const fs = await import("node:fs/promises")
    await fs.appendFile(file, '{"type":"message","message"', "utf8")

    const loaded = await Session.load(file)
    expect(loaded.messages).toEqual([u("ok")])
  })

  test("load throws on an unknown fromUuid", async () => {
    const file = path("badbranch")
    const s = new Session({ path: file })
    s.start()
    s.add(u("x"))
    await s.close()
    await expect(Session.load(file, { fromUuid: "no-such-uuid" })).rejects.toThrow(/not in file/)
  })
})
