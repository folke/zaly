import type { Message } from "@zaly/ai"
import type { SessionEvents, SessionNode } from "../src/session/index.ts"

import { describe, expect, test } from "vitest"
import { Session } from "../src/session/index.ts"

const u = (text: string): Message => ({ content: text, role: "user" })
const a = (text: string): Message => ({ content: text, role: "assistant" })

/** Strip session-assigned `id` / `ts` so deep-equal comparisons against
 *  hand-built `u()` / `a()` messages work — those fields are populated
 *  by `Session.add()` but tests want to assert only on role/content. */
function bare(msgs: readonly Message[]): Message[] {
  return msgs.map((m) => {
    const { id: _id, ts: _ts, ...rest } = m
    return rest as Message
  })
}

/** Sync sibling of `Session.load()` for the in-memory test path. The
 *  base constructor is `protected`, so test files build instances via a
 *  one-line subclass expression — same result, no async ceremony. */
class TestSession extends Session {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {
    super()
  }
}
const newSession = (): Session => new TestSession()

/** Build a started session with optional seed messages — replaces the
 *  old `initialMessages` constructor convenience for tests. */
function startedSession(init?: Message[]): Session {
  const s = newSession()
  s.start()
  for (const m of init ?? []) s.add(m)
  return s
}

/** Stub summary message for tests that exercise the compact boundary
 *  but don't care about the summary's content. */
const stubSummary: Message<"system"> = { content: "(test summary)", role: "system" }

/** Convenience wrapper — defaults `tail: 0` and a stub summary so tests
 *  that just want a compact boundary don't have to spell those out. */
function compactStub(
  s: Session,
  opts: Partial<Parameters<Session["compact"]>[0]> = {}
): string {
  return s.compact({ summary: stubSummary, tail: 0, ...opts })
}

describe("Session — basics", () => {
  test("constructor leaves the session unstarted (no nodes, undefined head)", () => {
    const s = newSession()
    expect(bare(s.messages)).toEqual([])
    expect(s.head).toBeUndefined()
    expect(s.nodes.size).toBe(0)
  })

  test("start() seeds the session-start node with given metadata", () => {
    const s = newSession()
    s.start({ modelId: "openai/gpt-4o", prompt: ["be brief"] })
    const start = s.nodes.get(s.head!) as Extract<SessionNode, { type: "session-start" }>
    expect(start.type).toBe("session-start")
    expect(start.parentUuid).toBeUndefined()
    expect(start.meta.prompt).toEqual(["be brief"])
    expect(start.meta.modelId).toBe("openai/gpt-4o")
  })

  test("start() on an already-started session writes a session-resume that updates meta", () => {
    const s = newSession()
    const firstHead = s.start({ modelId: "first" })
    const resumeHead = s.start({ modelId: "second" })
    expect(resumeHead).not.toBe(firstHead)
    expect(s.head).toBe(resumeHead)
    expect(s.nodes.size).toBe(2)
    const resume = s.nodes.get(resumeHead)!
    expect(resume.type).toBe("session-resume")
    expect(resume.parentUuid).toBe(firstHead)
    // Cumulative session meta reflects the updated modelId.
    expect(s.meta.modelId).toBe("second")
    // The original session-start is untouched.
    const start = s.nodes.get(firstHead) as Extract<SessionNode, { type: "session-start" }>
    expect(start.meta.modelId).toBe("first")
  })

  test("messages can be added in order after start()", () => {
    const s = newSession()
    s.start()
    s.add(u("hi"))
    s.add(a("hello"))
    expect(bare(s.messages)).toEqual([u("hi"), a("hello")])
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
  test("compaction with tail:0 reduces active chain to just the summary", () => {
    const s = startedSession([u("old"), a("older")])
    expect(s.messages).toHaveLength(2)
    compactStub(s, { preTokens: 12_000, trigger: "auto" })
    expect(bare(s.messages)).toEqual([stubSummary])
    s.add(u("fresh"))
    expect(bare(s.messages)).toEqual([stubSummary, u("fresh")])
    // pre-compact nodes still in the DAG (history)
    expect(s.nodes.size).toBe(5) // start + 2 old + compact + 1 new
  })

  test("compact with tail:N keeps the last N messages verbatim before the summary", () => {
    const s = startedSession()
    s.add(u("u1"))
    s.add(a("a1"))
    s.add(u("u2"))
    s.add(a("a2"))
    s.add(u("u3"))
    compactStub(s, { tail: 3 })
    // Active chain: [summary, last 3 pre-compact messages]
    expect(bare(s.messages)).toEqual([stubSummary, u("u2"), a("a2"), u("u3")])
  })

  test("compact with tail larger than available messages keeps everything available", () => {
    const s = startedSession([u("u1"), a("a1")])
    compactStub(s, { tail: 100 })
    // Only 2 pre-compact messages; tail walk runs out, summary still emitted.
    expect(bare(s.messages)).toEqual([stubSummary, u("u1"), a("a1")])
  })

  test("compact node carries the metadata + summary + tail", () => {
    const s = startedSession()
    s.add(u("hi"))
    const compactId = compactStub(s, {
      durationMs: 87,
      preTokens: 9000,
      tail: 1,
      trigger: "manual",
    })
    const node = s.nodes.get(compactId)!
    expect(node.type).toBe("compact")
    if (node.type !== "compact") throw new Error("expected compact node")
    expect(node.preTokens).toBe(9000)
    expect(node.durationMs).toBe(87)
    expect(node.trigger).toBe("manual")
    expect(node.tail).toBe(1)
    expect(node.summary).toEqual(stubSummary)
  })

  test("a second compact's tail walk stops at the earlier compact node", () => {
    // Two compactions with tail:5 each. Walking back from the second's tail
    // must NOT cross into the first compact's pre-compact history — those
    // messages were already summarized away.
    const s = startedSession()
    s.add(u("ancient1")) // pre-first-compact, summarized into compact A
    s.add(u("ancient2"))
    compactStub(s, { tail: 0 }) // compact A
    s.add(u("middle1")) // post-A, pre-B
    s.add(u("middle2"))
    compactStub(s, { tail: 5 }) // compact B with generous tail budget

    // Active chain after B: summary B + middle1 + middle2 (NOT ancient1/2).
    // Even though tail:5 would normally walk back further, the inner
    // walker stops at compact A.
    expect(bare(s.messages)).toEqual([stubSummary, u("middle1"), u("middle2")])
  })

  test("post-compact messages are appended after summary + kept tail", () => {
    const s = startedSession()
    s.add(u("u1"))
    s.add(a("a1"))
    compactStub(s, { tail: 2 })
    s.add(u("post1"))
    s.add(a("post2"))
    expect(bare(s.messages)).toEqual([stubSummary, u("u1"), a("a1"), u("post1"), a("post2")])
  })

  test("commit fires a compact event with the full compact node", () => {
    const s = startedSession([u("hi")])
    let captured: SessionEvents["compact"] | undefined
    s.on("compact", (e) => {
      captured = e
    })
    compactStub(s, { tail: 1 })
    expect(captured?.node.type).toBe("compact")
    expect(captured?.node.summary).toEqual(stubSummary)
    expect(captured?.node.tail).toBe(1)
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
    expect(bare(s.messages)).toEqual([u("first")])
  })

  test("navigating then adding creates a new branch — pre-navigate messages stay in nodes", () => {
    const s = startedSession()
    const u1 = s.add(u("first"))
    s.add(u("alt"))
    const u3 = s.add(u("alt2"))
    expect(s.nodes.size).toBe(4)
    s.navigate(u1)
    s.add(u("branched"))
    expect(bare(s.messages)).toEqual([u("first"), u("branched")])
    // u3 still in nodes — it's the head of the abandoned branch
    expect(s.nodes.get(u3)).toBeDefined()
    expect(s.nodes.size).toBe(5)
  })

  test("navigate(undefined) returns to root", () => {
    const s = startedSession([u("hi"), u("there")])
    s.navigate(undefined)
    expect(s.head).toBeUndefined()
    expect(bare(s.messages)).toEqual([])
  })

  test("navigate emits a navigate event with the new messages snapshot", () => {
    const s = startedSession([u("a"), u("b"), u("c")])
    const messageIds: string[] = []
    for (const [uuid, node] of s.nodes) {
      if (node.type === "message") messageIds.push(uuid)
    }
    const bUuid = messageIds[1] // chain: a → b → c; navigate to b
    let captured: SessionEvents["navigate"] | undefined
    s.on("navigate", (e) => {
      captured = e
    })
    s.navigate(bUuid)
    expect(captured?.head).toBe(bUuid)
    expect(captured?.messages.length).toBeLessThan(3)
  })

  test("navigating to an unknown uuid throws", () => {
    const s = newSession()
    expect(() => s.navigate("not-a-real-uuid")).toThrow(/unknown uuid/)
  })
})

describe("Session — history", () => {
  test("returns empty when there's nothing past the active chain", () => {
    const s = startedSession([u("hi"), a("hello")])
    expect(bare(s.history())).toEqual([])
  })

  test("returns pre-compact messages, chronological", () => {
    const s = startedSession()
    s.add(u("old1"))
    s.add(a("old2"))
    compactStub(s)
    s.add(u("fresh"))
    expect(bare(s.messages)).toEqual([stubSummary, u("fresh")])
    expect(bare(s.history())).toEqual([u("old1"), a("old2")])
  })

  test("walks past multiple compacts and returns everything before active", () => {
    const s = startedSession()
    s.add(u("a1"))
    compactStub(s)
    s.add(u("a2"))
    compactStub(s)
    s.add(u("a3"))
    expect(bare(s.messages)).toEqual([stubSummary, u("a3")])
    expect(bare(s.history())).toEqual([u("a1"), u("a2")])
  })

  test("limit truncates from the front (oldest), keeps the most recent history", () => {
    const s = startedSession()
    s.add(u("oldest"))
    s.add(u("middle"))
    s.add(u("newest"))
    compactStub(s)
    s.add(u("active"))
    expect(bare(s.history(2))).toEqual([u("middle"), u("newest")])
    expect(bare(s.history(1))).toEqual([u("newest")])
  })

  test("when active is just the summary (tail:0), history walks back past compact", () => {
    const s = startedSession()
    s.add(u("a"))
    s.add(u("b"))
    compactStub(s)
    expect(bare(s.messages)).toEqual([stubSummary])
    expect(bare(s.history())).toEqual([u("a"), u("b")])
  })
})

describe("Session — session-resume markers", () => {
  test("session-resume is not a chain boundary — messages flow through resume markers", () => {
    const s = newSession()
    s.start()
    s.add(u("first"))
    s.start() // simulate first reopen
    s.add(u("second"))
    s.start() // simulate second reopen
    s.add(u("third"))
    expect(bare(s.messages)).toEqual([u("first"), u("second"), u("third")])
  })

  test("messages survives many consecutive resume markers without intervening writes", () => {
    const s = newSession()
    s.start()
    s.add(u("hi"))
    // Simulate 5 reopens with no activity. Without the dedup, this would
    // append 5 resume nodes; with it, only the first call commits one.
    for (let i = 0; i < 5; i++) s.start()
    expect(bare(s.messages)).toEqual([u("hi")])
  })

  test("consecutive empty start() calls are deduplicated", () => {
    const s = newSession()
    s.start()
    s.add(u("hi"))
    const sizeBefore = s.nodes.size
    s.start() // first reopen — writes a session-resume
    const sizeAfterFirstResume = s.nodes.size
    expect(sizeAfterFirstResume).toBe(sizeBefore + 1)
    s.start() // second reopen — deduped, no new node
    s.start() // third reopen — deduped
    expect(s.nodes.size).toBe(sizeAfterFirstResume)
  })

  test("start() with new meta is NOT deduped (records the meta change)", () => {
    const s = newSession()
    s.start()
    s.add(u("hi"))
    s.start() // first resume
    const sizeBeforeMetaResume = s.nodes.size
    s.start({ modelId: "anthropic/claude" }) // resume with meta — must commit
    expect(s.nodes.size).toBe(sizeBeforeMetaResume + 1)
    expect(s.meta.modelId).toBe("anthropic/claude")
  })

  test("messages still works when head sits on a session-resume node", () => {
    const s = newSession()
    s.start()
    s.add(u("before-reopen"))
    s.start() // head now on the resume marker
    expect(bare(s.messages)).toEqual([u("before-reopen")])
  })

  test("compact still acts as a boundary after a resume", () => {
    const s = newSession()
    s.start()
    s.add(u("pre-compact"))
    compactStub(s)
    s.start() // resume after compact
    s.add(u("post-compact"))
    expect(bare(s.messages)).toEqual([stubSummary, u("post-compact")])
    expect(bare(s.history())).toEqual([u("pre-compact")])
  })
})

function tmpPath(name: string): string {
  return `${process.env.TMPDIR ?? "/tmp"}/zaly-session-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}.jsonl`
}

describe("Session — JSONL persistence", () => {
  const path = tmpPath

  test("writes one record per node and round-trips via load", async () => {
    const file = path("roundtrip")
    const s = await Session.load({ path: file })
    s.start({ modelId: "openai/gpt-4o", prompt: ["be brief"] })
    s.add(u("hi"))
    s.update({ modelId: "openai/gpt-4o", prompt: ["be more detailed"] })
    const aId = s.add(a("hello"), { usage: { input: 5, output: 2 } })
    s.add(u("again"))
    await s.close()

    const loaded = await Session.load({ path: file })
    expect(loaded.head).toBe(s.head)
    expect(loaded.messages).toEqual(s.messages)
    expect(loaded.nodes.size).toBe(s.nodes.size)
    // Metadata round-trips on the assistant node
    const aNode = loaded.nodes.get(aId)!
    if (aNode.type !== "message") throw new Error("expected message node")
    expect(aNode.usage).toEqual({ input: 5, output: 2 })
    expect(aNode.meta.modelId).toBe("openai/gpt-4o")
    await loaded.close()
  })

  test("compact + post-compact messages survive a round-trip with summary + tail", async () => {
    const file = path("compact")
    const s = await Session.load({ path: file })
    s.start()
    s.add(u("old1"))
    s.add(a("old2"))
    s.compact({ preTokens: 50, summary: stubSummary, tail: 1, trigger: "auto" })
    s.add(u("fresh"))
    await s.close()

    const loaded = await Session.load({ path: file })
    // Active chain: summary + last 1 pre-compact (a("old2")) + post-compact ("fresh")
    expect(bare(loaded.messages)).toEqual([stubSummary, a("old2"), u("fresh")])
    // Pre-compact records still in the DAG (history) — tail messages are
    // ALSO in active, but not duplicated in the underlying node store.
    expect(loaded.nodes.size).toBe(5) // start + 2 old + compact + 1 fresh
  })

  test("load picks the latest record as head by default", async () => {
    const file = path("latest")
    const s = await Session.load({ path: file })
    s.start()
    s.add(u("a"))
    s.add(u("b"))
    const lastHead = s.head
    await s.close()

    const loaded = await Session.load({ path: file })
    expect(loaded.head).toBe(lastHead)
  })

  test("load(path, { fromUuid }) navigates to a branch head", async () => {
    const file = path("branch")
    const s = await Session.load({ path: file })
    s.start()
    s.add(u("first"))
    const branchPoint = s.head!
    s.add(u("alt-future"))
    await s.close()

    const loaded = await Session.load({ path: file, head: branchPoint })
    expect(loaded.head).toBe(branchPoint)
    expect(bare(loaded.messages)).toEqual([u("first")])
  })

  test("load tolerates a truncated last line (crash mid-write)", async () => {
    const file = path("truncated")
    const s = await Session.load({ path: file })
    s.start()
    s.add(u("ok"))
    await s.close()

    // Append a partial JSON line — what a crash mid-write would leave.
    const fs = await import("node:fs/promises")
    await fs.appendFile(file, '{"type":"message","message"', "utf8")

    const loaded = await Session.load({ path: file })
    expect(bare(loaded.messages)).toEqual([u("ok")])
  })

  test("load throws on an unknown fromUuid", async () => {
    const file = path("badbranch")
    const s = await Session.load({ path: file })
    s.start()
    s.add(u("x"))
    await s.close()
    await expect(Session.load({ path: file, head: "no-such-uuid" })).rejects.toThrow(/not in file/)
  })
})

describe("Session — meta accumulation", () => {
  test("session.meta accumulates across start + updates without redundant writes", async () => {
    const file = tmpPath("meta-accumulate")
    const s = await Session.load({ cwd: "/foo", path: file })
    s.start({ modelId: "openai/gpt-4o" })
    expect(s.meta).toEqual({ cwd: "/foo", modelId: "openai/gpt-4o" })
    expect(s.cwd).toBe("/foo")

    // Same modelId (no-op for that key) + new prompt — only prompt is new.
    s.update({ modelId: "openai/gpt-4o", prompt: ["be brief"] })
    expect(s.meta).toEqual({ cwd: "/foo", modelId: "openai/gpt-4o", prompt: ["be brief"] })

    // Empty update — no node should be committed.
    const before = s.nodes.size
    s.update({})
    expect(s.nodes.size).toBe(before)

    // Only modelId changes — cwd and prompt stay.
    s.update({ modelId: "anthropic/claude" })
    expect(s.meta).toEqual({ cwd: "/foo", modelId: "anthropic/claude", prompt: ["be brief"] })

    // Setting cwd to a different value triggers a session-meta commit.
    const sizeBeforeCwd = s.nodes.size
    s.update({ cwd: "/bar" })
    expect(s.cwd).toBe("/bar")
    expect(s.meta.cwd).toBe("/bar")
    expect(s.nodes.size).toBe(sizeBeforeCwd + 1)

    // Setting cwd to the same value is a no-op (no new node).
    const sizeAfterCwd = s.nodes.size
    s.update({ cwd: "/bar" })
    expect(s.nodes.size).toBe(sizeAfterCwd)

    await s.close()
  })

  test("partial meta deltas reconstitute correctly on round-trip", async () => {
    const file = tmpPath("meta-roundtrip")
    const s = await Session.load({ cwd: "/foo", path: file })
    s.start({ modelId: "openai/gpt-4o" })
    s.add(u("hi"))
    s.update({ prompt: ["be brief"] })
    s.add(a("hello"))
    s.update({ modelId: "anthropic/claude" })
    s.add(u("again"))
    await s.close()

    const loaded = await Session.load({ path: file })
    // Cumulative meta is the merge of every prior delta.
    expect(loaded.meta).toEqual({
      cwd: "/foo",
      modelId: "anthropic/claude",
      prompt: ["be brief"],
    })
    expect(loaded.cwd).toBe("/foo")
    // Active chain isn't broken by interleaved session-meta nodes.
    expect(bare(loaded.messages)).toEqual([u("hi"), a("hello"), u("again")])
    await loaded.close()
  })

  test("on-disk records are delta-encoded — only changed keys appear per record", async () => {
    const file = tmpPath("meta-delta")
    const s = await Session.load({ cwd: "/foo", path: file })
    s.start({ modelId: "openai/gpt-4o" })
    s.add(u("hi")) // no meta change → no `meta` field on disk
    s.update({ modelId: "anthropic/claude" }) // only modelId
    const sessionId = s.id
    await s.close()

    const fs = await import("node:fs/promises")
    const text = await fs.readFile(file, "utf8")
    const lines = text.split("\n").filter((l) => l.length > 0)
    const records = lines.map(
      (l) =>
        JSON.parse(l) as {
          type: string
          meta?: {
            cwd?: string
            modelId?: string
            sessionId?: string
            sessionDir?: string
            version?: number
          }
        }
    )

    // session-start: cumulative meta — user-supplied + auto-stamped
    // internal fields (sessionId, sessionDir, version).
    expect(records[0].type).toBe("session-start")
    expect(records[0].meta).toMatchObject({
      cwd: "/foo",
      modelId: "openai/gpt-4o",
      sessionId, // session.id (separate from the session-start node's uuid)
      version: 1,
    })

    // message with no meta change: no `meta` field at all
    expect(records[1].type).toBe("message")
    expect(records[1].meta).toBeUndefined()

    // session-meta: only the changed key (modelId)
    expect(records[2].type).toBe("session-meta")
    expect(records[2].meta).toEqual({ modelId: "anthropic/claude" })
  })

  test("each in-memory node carries the cumulative meta snapshot at its time", async () => {
    const file = tmpPath("meta-snapshot")
    const s = await Session.load({ cwd: "/foo", path: file })
    const startId = s.start({ modelId: "openai/gpt-4o" })
    const u1 = s.add(u("hi"))
    s.update({ modelId: "anthropic/claude" })
    const u2 = s.add(u("after-swap"))
    await s.close()

    // Live in-memory: each node sees the public meta (cwd/modelId/prompt)
    // as of its commit. sessionId / sessionDir / version are internal
    // and stripped from node.meta.
    expect(s.nodes.get(startId)?.meta).toEqual({ cwd: "/foo", modelId: "openai/gpt-4o" })
    expect(s.nodes.get(u1)?.meta).toEqual({ cwd: "/foo", modelId: "openai/gpt-4o" })
    expect(s.nodes.get(u2)?.meta).toEqual({ cwd: "/foo", modelId: "anthropic/claude" })

    // Loaded from disk: same per-node snapshot shape.
    const loaded = await Session.load({ path: file })
    expect(loaded.nodes.get(startId)?.meta).toEqual({ cwd: "/foo", modelId: "openai/gpt-4o" })
    expect(loaded.nodes.get(u1)?.meta).toEqual({ cwd: "/foo", modelId: "openai/gpt-4o" })
    expect(loaded.nodes.get(u2)?.meta).toEqual({ cwd: "/foo", modelId: "anthropic/claude" })
    expect(loaded.cwd).toBe("/foo")
    await loaded.close()
  })
})
