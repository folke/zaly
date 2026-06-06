// oxlint-disable unicorn/no-await-expression-member
import type { Message } from "@zaly/ai"
import type { SessionEvents, SessionNode } from "../src/session/index.ts"

import { describe, expect, test } from "vitest"
import { MemoryStore, Session } from "../src/session/index.ts"

const u = (text: string): Message<"user"> => ({ content: text, role: "user" })
const a = (text: string): Message<"assistant"> => ({ content: text, role: "assistant" })

/** Strip session-assigned `id` / `ts` so deep-equal comparisons against
 *  hand-built `u()` / `a()` messages work. Also strips
 *  `meta.modelId` since it's reconstructed from session-meta on read,
 *  not intrinsic to the message. Empty `meta` is removed entirely. */
function bare(msgs: readonly Message[]): Message[] {
  return msgs.map((m) => {
    const { id: _id, ts: _ts, ...rest } = m
    if (rest.role === "assistant" && rest.meta) {
      const { modelId: _mid, ...metaRest } = rest.meta
      if (Object.keys(metaRest).length === 0) {
        const { meta: _drop, ...noMeta } = rest
        return noMeta as Message
      }
      return { ...rest, meta: metaRest } as Message
    }
    return rest as Message
  })
}

const newSession = async (): Promise<Session<MemoryStore>> =>
  await Session.load({ store: new MemoryStore() })

async function startedSession(init?: Message[]): Promise<Session<MemoryStore>> {
  const s = await newSession()
  await s.start()
  for (const m of init ?? []) await s.add(m)
  return s
}

const stubSummary: Message<"system"> = { content: "(test summary)", role: "system" }

async function compactStub(
  s: Session,
  opts: Partial<Parameters<Session["compact"]>[0]> = {}
): Promise<string> {
  return s.compact({ summary: stubSummary, tail: 0, ...opts })
}

/** Materialize the store's full DAG into an array — for assertions about
 *  total node count and direct lookups. */
async function allNodes(s: Session): Promise<SessionNode[]> {
  const out: SessionNode[] = []
  for await (const node of s.nodes()) out.push(node)
  return out
}

describe("Session — basics", () => {
  test("constructor leaves the session unstarted (empty store, no head)", async () => {
    const s = await newSession()
    expect(s.messages).toEqual([])
    expect(s.head).toBeUndefined()
  })

  test("start() commits a session-start node on a fresh session", async () => {
    const s = await newSession()
    await s.start()
    expect(s.head).toBeDefined()
    const nodes = await allNodes(s)
    expect(nodes[0].type).toBe("session-start")
    expect(nodes[0].parentUuid).toBeUndefined()
  })

  test("start({ modelId, prompt }) records the meta on the snapshot", async () => {
    const s = await newSession()
    await s.start({ modelId: "openai/gpt-4o" })
    expect(s.settings.modelId).toBe("openai/gpt-4o")
    // session-start is the root marker; the meta lives on a session-meta
    // node committed right after by update().
    const nodes = await allNodes(s)
    expect(nodes[0].type).toBe("session-start")
    expect(nodes[1].type).toBe("session-settings")
    if (nodes[1].type !== "session-settings") throw new Error("expected session-settings")
    expect(nodes[1].settings.modelId).toBe("openai/gpt-4o")
  })

  test("start() on an already-started session is idempotent (no extra marker)", async () => {
    // Autostart fires at most once per Session instance — subsequent
    // start() calls just flow the meta through `update()`. Hydrated
    // sessions get session-resume on their first commit; explicit
    // resume markers only appear when a new Session instance is
    // constructed against a non-empty store.
    const s = await newSession()
    await s.start({ modelId: "first" })
    const before = (await allNodes(s)).length
    await s.start({ modelId: "second" })
    expect(s.settings.modelId).toBe("second")
    // Only the meta-change session-meta landed — no fresh session-start
    // / session-resume marker.
    const after = (await allNodes(s)).length
    expect(after - before).toBe(1)
    const nodes = await allNodes(s)
    expect(nodes.filter((n) => n.type === "session-start")).toHaveLength(1)
    expect(nodes.filter((n) => n.type === "session-resume")).toHaveLength(0)
  })

  test("messages added in order with intact parent chain", async () => {
    const s = await startedSession()
    const u1 = await s.add(u("hi"))
    const u2 = await s.add(a("hello"))
    expect(s.head).toBe(u2)
    expect(bare(s.messages)).toEqual([u("hi"), a("hello")])
    // Walk parentUuid backward from u2 — must reach u1, then continue
    // back through any auto-snapshot session-meta nodes to the
    // session-start. Doesn't matter exactly which markers appear, just
    // that the chain is unbroken and ordered.
    const nodes = await allNodes(s)
    const byUuid = new Map(nodes.map((n) => [n.uuid, n]))
    const visited: SessionNode[] = []
    let cursor: string | undefined = u2
    while (cursor) {
      const node: SessionNode | undefined = byUuid.get(cursor)
      if (!node) break
      visited.push(node)
      cursor = node.parentUuid
    }
    const messageUuids = visited.filter((n) => n.type === "message").map((n) => n.uuid)
    expect(messageUuids).toEqual([u2, u1]) // newest-first via walk
    expect(visited.at(-1)?.type).toBe("session-start") // root reached
  })

  test("emits one node event per message in order", async () => {
    const s = await startedSession()
    const seen: string[] = []
    s.on("node", (e) => {
      if (e.node.type === "message") seen.push((e.node.message as { content: string }).content)
    })
    await s.add(u("a"))
    await s.add(u("b"))
    await s.add(u("c"))
    expect(seen).toEqual(["a", "b", "c"])
  })
})

describe("Session — meta snapshots", () => {
  test("update() merges into cumulative meta", async () => {
    const s = await startedSession()
    await s.update({ modelId: "openai/gpt-4o" })
    expect(s.settings.modelId).toBe("openai/gpt-4o")
    await s.update({ reasoning: "xhigh" })
    expect(s.settings).toMatchObject({ modelId: "openai/gpt-4o", reasoning: "xhigh" })
  })

  test("update() with no real change is a no-op (no new node)", async () => {
    const s = await startedSession()
    await s.update({ modelId: "openai/gpt-4o" })
    const before = (await allNodes(s)).length
    await s.update({ modelId: "openai/gpt-4o" }) // same value
    expect((await allNodes(s)).length).toBe(before)
    await s.update({}) // empty
    expect((await allNodes(s)).length).toBe(before)
  })

  test("session.cwd updates when an incoming meta carries a new cwd", async () => {
    const s = await newSession()
    await s.start({ modelId: "x" })
    const initialCwd = s.settings.cwd
    await s.update({ cwd: "/new/path" })
    expect(s.settings.cwd).toBe("/new/path")
    expect(s.settings.cwd).not.toBe(initialCwd)
    expect(s.settings.cwd).toBe("/new/path")
  })

  test("emits 'cwd' event when cwd changes", async () => {
    const s = await startedSession()
    let captured: string | undefined
    s.on("cwd", (e) => {
      captured = e.cwd
    })
    await s.update({ cwd: "/elsewhere" })
    expect(captured).toBe("/elsewhere")
  })
})

describe("Session — compact", () => {
  test("compact with tail:0 reduces active chain to just the summary", async () => {
    const s = await startedSession([u("old"), a("older")])
    expect(s.messages).toHaveLength(2)
    await compactStub(s, { preTokens: 12_000, trigger: "auto" })
    expect(bare(s.messages)).toEqual([stubSummary])
    await s.add(u("fresh"))
    expect(bare(s.messages)).toEqual([stubSummary, u("fresh")])
  })

  test("compact with tail:N keeps the last N messages verbatim before the summary", async () => {
    const s = await startedSession()
    await s.add(u("u1"))
    await s.add(a("a1"))
    await s.add(u("u2"))
    await s.add(a("a2"))
    await s.add(u("u3"))
    await compactStub(s, { tail: 3 })
    expect(bare(s.messages)).toEqual([stubSummary, u("u2"), a("a2"), u("u3")])
  })

  test("compact with tail larger than available keeps everything available", async () => {
    const s = await startedSession([u("u1"), a("a1")])
    await compactStub(s, { tail: 100 })
    expect(bare(s.messages)).toEqual([stubSummary, u("u1"), a("a1")])
  })

  test("compact node carries summary + tail + trigger metadata", async () => {
    const s = await startedSession([u("hi")])
    const compactId = await compactStub(s, {
      durationMs: 87,
      preTokens: 9000,
      tail: 1,
      trigger: "manual",
    })
    const nodes = await allNodes(s)
    const node = nodes.find((n) => n.uuid === compactId)
    expect(node?.type).toBe("compact")
    if (node?.type !== "compact") throw new Error("expected compact node")
    expect(node.preTokens).toBe(9000)
    expect(node.durationMs).toBe(87)
    expect(node.trigger).toBe("manual")
    expect(node.tail).toBe(1)
    expect(node.summary).toEqual(stubSummary)
  })

  test("a second compact's tail walk stops at the earlier compact node", async () => {
    const s = await startedSession()
    await s.add(u("ancient1"))
    await s.add(u("ancient2"))
    await compactStub(s, { tail: 0 }) // compact A
    await s.add(u("middle1"))
    await s.add(u("middle2"))
    await compactStub(s, { tail: 5 }) // compact B with generous tail budget
    // The inner walk for B's tail must NOT cross compact A.
    expect(bare(s.messages)).toEqual([stubSummary, u("middle1"), u("middle2")])
  })

  test("post-compact messages are appended after summary + kept tail", async () => {
    const s = await startedSession()
    await s.add(u("u1"))
    await s.add(a("a1"))
    await compactStub(s, { tail: 2 })
    await s.add(u("post1"))
    await s.add(a("post2"))
    expect(bare(s.messages)).toEqual([stubSummary, u("u1"), a("a1"), u("post1"), a("post2")])
  })

  test("emits 'compact' event with the full compact node", async () => {
    const s = await startedSession([u("hi")])
    let captured: SessionEvents["compact"] | undefined
    s.on("compact", (e) => {
      captured = e
    })
    await compactStub(s, { tail: 1 })
    expect(captured?.node.type).toBe("compact")
    expect(captured?.node.summary).toEqual(stubSummary)
    expect(captured?.node.tail).toBe(1)
  })

  test("commits a meta-snapshot anchor right after the compact", async () => {
    // Post-compact session-meta ensures lazy walks always have a nearby
    // meta entry without scanning back across the compact boundary.
    const s = await startedSession()
    await s.update({ modelId: "openai/gpt-4o" })
    await s.add(u("hi"))
    await compactStub(s, { tail: 0 })
    const nodes = await allNodes(s)
    const last = nodes.at(-1)
    expect(last?.type).toBe("session-settings")
    if (last?.type !== "session-settings") throw new Error("expected session-settings anchor")
    expect(last.settings.modelId).toBe("openai/gpt-4o")
  })
})

describe("Session — history", () => {
  test("returns empty when there's nothing past the active chain", async () => {
    const s = await startedSession([u("hi"), a("hello")])
    expect(bare(await s.history())).toEqual([u("hi"), a("hello")])
  })

  test("returns pre-compact messages, chronological", async () => {
    const s = await startedSession()
    await s.add(u("old1"))
    await s.add(a("old2"))
    await compactStub(s)
    await s.add(u("fresh"))
    expect(bare(s.messages)).toEqual([stubSummary, u("fresh")])
    expect(bare(await s.history())).toEqual([u("old1"), a("old2"), u("fresh")])
  })

  test("walks past multiple compacts and returns everything before active", async () => {
    const s = await startedSession()
    await s.add(u("a1"))
    await compactStub(s)
    await s.add(u("a2"))
    await compactStub(s)
    await s.add(u("a3"))
    expect(bare(s.messages)).toEqual([stubSummary, u("a3")])
    expect(bare(await s.history())).toEqual([u("a1"), u("a2"), u("a3")])
  })

  test("limit truncates from the front (oldest)", async () => {
    const s = await startedSession()
    await s.add(u("oldest"))
    await s.add(u("middle"))
    await s.add(u("newest"))
    await compactStub(s)
    await s.add(u("active"))
    expect(bare(await s.history(3))).toEqual([u("middle"), u("newest"), u("active")])
    expect(bare(await s.history(1))).toEqual([u("active")])
  })

  test("when active is just the summary (tail:0), history walks past compact", async () => {
    const s = await startedSession()
    await s.add(u("a"))
    await s.add(u("b"))
    await compactStub(s)
    expect(bare(s.messages)).toEqual([stubSummary])
    expect(bare(await s.history())).toEqual([u("a"), u("b")])
  })
})

describe("Session — session-resume markers", () => {
  test("session-resume is not a chain boundary — messages flow through", async () => {
    const s = await newSession()
    await s.start()
    await s.add(u("first"))
    await s.start() // simulate first reopen
    await s.add(u("second"))
    await s.start() // simulate second reopen
    await s.add(u("third"))
    expect(bare(s.messages)).toEqual([u("first"), u("second"), u("third")])
  })

  test("messages still works when head sits on a session-resume", async () => {
    const s = await newSession()
    await s.start()
    await s.add(u("before-reopen"))
    await s.start() // head now on the resume marker
    expect(bare(s.messages)).toEqual([u("before-reopen")])
  })

  test("compact still acts as a boundary after a resume", async () => {
    const s = await newSession()
    await s.start()
    await s.add(u("pre-compact"))
    await compactStub(s)
    await s.start() // resume after compact
    await s.add(u("post-compact"))
    expect(bare(s.messages)).toEqual([stubSummary, u("post-compact")])
    expect(bare(await s.history())).toEqual([u("pre-compact"), u("post-compact")])
  })
})

function tmpPath(name: string): string {
  return `${process.env.TMPDIR ?? "/tmp"}/zaly-session-${Date.now()}-${Math.random().toString(36).slice(2)}-${name}.jsonl`
}

describe("Session — JSONL persistence", () => {
  test("writes one record per node and round-trips via load", async () => {
    const file = tmpPath("roundtrip")
    const s = await Session.load({ path: file })
    await s.start({ modelId: "openai/gpt-4o", reasoning: "high" })
    await s.add(u("hi"))
    await s.update({ modelId: "openai/gpt-4o", reasoning: "xhigh" })
    await s.add({ ...a("hello"), meta: { usage: { input: 5, output: 2 } } })
    await s.add(u("again"))
    await s.close()

    const loaded = await Session.load({ path: file })
    expect(loaded.head).toBe(s.head)
    expect(bare([...loaded.messages])).toEqual(bare([...s.messages]))
    expect(loaded.settings.modelId).toBe("openai/gpt-4o")
    expect(loaded.settings.reasoning).toBe("xhigh")
    await loaded.close()
  })

  test("compact + post-compact messages survive round-trip with summary + tail", async () => {
    const file = tmpPath("compact")
    const s = await Session.load({ path: file })
    await s.start()
    await s.add(u("old1"))
    await s.add(a("old2"))
    await s.compact({ preTokens: 50, summary: stubSummary, tail: 1, trigger: "auto" })
    await s.add(u("fresh"))
    await s.close()

    const loaded = await Session.load({ path: file })
    expect(bare([...loaded.messages])).toEqual([stubSummary, a("old2"), u("fresh")])
    await loaded.close()
  })

  test("load picks the latest record as head by default", async () => {
    const file = tmpPath("latest")
    const s = await Session.load({ path: file })
    await s.start()
    await s.add(u("a"))
    await s.add(u("b"))
    const lastHead = s.head
    await s.close()

    const loaded = await Session.load({ path: file })
    expect(loaded.head).toBe(lastHead)
    await loaded.close()
  })

  test("load tolerates a truncated last line (crash mid-write)", async () => {
    const file = tmpPath("truncated")
    const s = await Session.load({ path: file })
    await s.start()
    await s.add(u("ok"))
    await s.close()

    // Append a partial JSON line — what a crash mid-write would leave.
    const fs = await import("node:fs/promises")
    await fs.appendFile(file, '{"type":"message","message"', "utf8")

    const loaded = await Session.load({ path: file })
    expect(bare([...loaded.messages])).toEqual([u("ok")])
    await loaded.close()
  })
})

describe("Session — meta on disk", () => {
  test("session-meta nodes carry full snapshots; other types don't carry meta", async () => {
    const file = tmpPath("snapshot")
    const s = await Session.load({ path: file })
    await s.start({ cwd: "/foo", modelId: "openai/gpt-4o" })
    await s.add(u("hi"))
    await s.update({ modelId: "anthropic/claude" })
    await s.close()

    const fs = await import("node:fs/promises")
    const lines = (await fs.readFile(file, "utf8")).split("\n").filter((l) => l.length > 0)
    const records = lines.map((l) => JSON.parse(l) as SessionNode)

    // session-start is a pure marker — no meta field
    expect(records[0].type).toBe("session-start")
    expect((records[0] as { meta?: unknown }).meta).toBeUndefined()

    // session-settings carries full snapshot including internals
    const metas = records.filter(
      (r): r is Extract<SessionNode, { type: "session-settings" }> => r.type === "session-settings"
    )
    expect(metas.length).toBeGreaterThan(0)
    for (const m of metas) {
      expect(m.settings.cwd).toBe("/foo")
      expect(m.settings.sessionId).toBe(s.id)
      expect(m.settings.version).toBe(1)
    }
    // The latest session-meta carries the most recent modelId
    const latestMeta = metas.at(-1)
    expect(latestMeta?.settings.modelId).toBe("anthropic/claude")

    // message records don't carry meta
    const messageRecord = records.find((r) => r.type === "message")
    if (messageRecord) expect((messageRecord as { meta?: unknown }).meta).toBeUndefined()
  })

  test("cumulative meta is reconstructed on load from the latest session-meta", async () => {
    const file = tmpPath("cumulative")
    const s = await Session.load({ path: file })
    await s.start({ cwd: "/foo", modelId: "openai/gpt-4o" })
    await s.update({ reasoning: "high" })
    await s.update({ modelId: "anthropic/claude" })
    await s.close()

    const loaded = await Session.load({ path: file })
    expect(loaded.settings).toMatchObject({
      cwd: "/foo",
      modelId: "anthropic/claude",
      reasoning: "high",
    })
    await loaded.close()
  })

  test("assistant messages inherit the model from their own position in the chain", async () => {
    const file = tmpPath("message-model")
    const s = await Session.load({ path: file })
    await s.start({ modelId: "openai/gpt-4o" })
    await s.add(a("one"))
    await s.update({ modelId: "anthropic/claude" })
    await s.add(a("two"))
    await s.close()

    const loaded = await Session.load({ path: file })
    const assistants = loaded.messages.filter(
      (m): m is Message<"assistant"> => m.role === "assistant"
    )
    expect(assistants.map((m) => m.meta?.modelId)).toEqual(["openai/gpt-4o", "anthropic/claude"])
    await loaded.close()
  })
})
