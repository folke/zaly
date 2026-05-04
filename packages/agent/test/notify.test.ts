import type { MetaPart } from "@zaly/ai"
import type { Agent } from "../src/agent.ts"
import type { SessionNode } from "../src/session/index.ts"
import type { ContextPressure } from "../src/types.ts"

import { describe, expect, test } from "vitest"
import { Notifier } from "../src/notify.ts"
import { MemoryStore, Session } from "../src/session/index.ts"

/** Build a minimal Agent stand-in carrying just what `Notifier` reads:
 *  `session`, `notify`, `pressure`, `model`. The notify queue is
 *  exposed for assertions. */
async function mockAgent(opts: {
  pressure?: ContextPressure
  modelId?: string
} = {}): Promise<{
  agent: Agent
  notifications: Omit<MetaPart, "type">[]
  session: Session
  setPressure: (p: ContextPressure) => void
}> {
  const session = await Session.load({ store: new MemoryStore() })
  await session.start()
  const notifications: Omit<MetaPart, "type">[] = []
  let pressure: ContextPressure = opts.pressure ?? {
    level: 0,
    limit: 100_000,
    ratio: 0,
    used: 0,
  }
  const agent = {
    get session() {
      return session
    },
    notify(meta: Omit<MetaPart, "type">) {
      notifications.push(meta)
    },
    get pressure() {
      return pressure
    },
    get model() {
      return { id: opts.modelId ?? "anthropic/claude-sonnet-4-6" }
    },
  } as unknown as Agent
  return {
    agent,
    notifications,
    session,
    setPressure: (p) => {
      pressure = p
    },
  }
}

const findTag = (
  notifications: readonly Omit<MetaPart, "type">[],
  tag: string
): Omit<MetaPart, "type"> | undefined => notifications.find((n) => n.tag === tag)

describe("Notifier — event-driven lifecycle", () => {
  test("session-start event triggers a 'session-start' notification", async () => {
    // Notifier attaches to a fresh in-memory session that's already started,
    // so we have to create an unstarted one and start it after attach.
    const session = await Session.load({ store: new MemoryStore() })
    const notifications: Omit<MetaPart, "type">[] = []
    const agent = {
      session,
      notify: (m: Omit<MetaPart, "type">) => notifications.push(m),
      pressure: { level: 0, limit: 100_000, ratio: 0, used: 0 },
      model: { id: "x" },
    } as unknown as Agent
    new Notifier().attach(agent)
    await session.start()
    expect(findTag(notifications, "session-start")).toBeDefined()
    expect(findTag(notifications, "session-start")?.data).toMatchObject({
      date: expect.any(String),
      time: expect.any(String),
    })
  })

  test("session-resume event triggers a 'session-resume' notification", async () => {
    // Phase 1: build a session with prior messages so the store has real
    // active-chain content. Collect its nodes for use as a seed.
    const seed = await Session.load({ store: new MemoryStore() })
    await seed.start()
    await seed.add({ content: "hi", role: "user" })
    const seedNodes: SessionNode[] = []
    for await (const n of seed.nodes()) seedNodes.push(n)

    // Phase 2: load via the seeded store — Session.load runs #rebuild()
    // so view.messages reflects the hydrated content. Subsequent autostart
    // sees messages.length > 0 and fires session-resume (not session-start).
    const session = await Session.load({ store: new MemoryStore(seedNodes) })
    const notifications: Omit<MetaPart, "type">[] = []
    const agent = {
      session,
      notify: (m: Omit<MetaPart, "type">) => notifications.push(m),
      pressure: { level: 0, limit: 100_000, ratio: 0, used: 0 },
      model: { id: "x" },
    } as unknown as Agent
    new Notifier().attach(agent)

    await session.add({ content: "follow-up", role: "user" })
    expect(findTag(notifications, "session-resume")).toBeDefined()
    expect(findTag(notifications, "session-start")).toBeUndefined()
  })

  test("compact event triggers 'compacted' notification + resets pressure", async () => {
    const session = await Session.load({ store: new MemoryStore() })
    await session.start()
    await session.add({ content: "hi", role: "user" })
    const notifications: Omit<MetaPart, "type">[] = []
    let pressure: ContextPressure = { level: 2, limit: 100, ratio: 0.9, used: 90 }
    const agent = {
      session,
      notify: (m: Omit<MetaPart, "type">) => notifications.push(m),
      get pressure() {
        return pressure
      },
      model: { id: "x" },
    } as unknown as Agent
    const notifier = new Notifier()
    notifier.attach(agent)
    // Prime the notifier's pressure tracking by calling check() — should
    // record the current level so we can verify it gets reset on compact.
    notifier.check({ agent })
    notifications.length = 0 // ignore any check()-driven notifications

    await session.compact({
      summary: { content: "(test summary)", role: "system" },
      tail: 2,
      trigger: "auto",
    })

    const compacted = findTag(notifications, "compacted")
    expect(compacted).toBeDefined()
    expect(compacted?.data).toMatchObject({
      messages_preserved: 2,
      trigger: "auto",
    })

    // After compact, pressure level was reset internally. Drop the actual
    // pressure to 0 and verify the notifier doesn't think we already
    // notified about the previous level.
    pressure = { level: 0, limit: 100, ratio: 0.1, used: 10 }
    notifier.check({ agent })
    // Now climb back up — should re-fire context-pressure since the reset
    // means the previous "level 2" notification doesn't suppress us.
    pressure = { level: 1, limit: 100, ratio: 0.8, used: 80 }
    notifier.check({ agent })
    expect(findTag(notifications, "context-pressure")).toBeDefined()
  })

  test("cwd event triggers 'cwd-changed' notification with new cwd", async () => {
    const { agent, notifications, session } = await mockAgent()
    new Notifier().attach(agent)
    await session.update({ cwd: "/elsewhere" })
    const cwdChange = findTag(notifications, "cwd-changed")
    expect(cwdChange).toBeDefined()
    expect(cwdChange?.data).toEqual({ cwd: "/elsewhere" })
  })

  test("meta event with modelId change triggers 'model-changed'", async () => {
    const { agent, notifications, session } = await mockAgent()
    await session.update({ modelId: "anthropic/claude-sonnet-4-6" })
    new Notifier().attach(agent)
    await session.update({ modelId: "openai/gpt-5" })
    const change = findTag(notifications, "model-changed")
    expect(change).toBeDefined()
    expect(change?.data).toEqual({
      current: "openai/gpt-5",
      previous: "anthropic/claude-sonnet-4-6",
    })
  })

  test("meta event without modelId change does NOT trigger 'model-changed'", async () => {
    const { agent, notifications, session } = await mockAgent()
    new Notifier().attach(agent)
    await session.update({ prompt: ["be brief"] })
    expect(findTag(notifications, "model-changed")).toBeUndefined()
  })
})

describe("Notifier — check() polling", () => {
  test("first check() with no prior step records lastStep but emits nothing", async () => {
    const { agent, notifications } = await mockAgent()
    new Notifier().attach(agent)
    notifications.length = 0 // ignore session-start fired during mockAgent setup
    new Notifier().check({ agent })
    expect(notifications).toEqual([])
  })

  test("user-returned fires after idle threshold elapses", async () => {
    const { agent, notifications } = await mockAgent()
    const notifier = new Notifier({ idle: 1 }) // 1 second idle
    notifier.attach(agent)
    notifications.length = 0
    // Prime lastStep
    notifier.check({ agent })
    // Wait beyond threshold (use a deliberately short idle to keep test fast)
    await new Promise((r) => setTimeout(r, 1100))
    notifier.check({ agent })
    expect(findTag(notifications, "user-returned")).toBeDefined()
  })

  test("periodic 'time' notification fires after periodic threshold", async () => {
    const { agent, notifications } = await mockAgent()
    const notifier = new Notifier({ idle: 3600, periodic: 1 }) // 1 second periodic
    notifier.attach(agent)
    notifications.length = 0
    notifier.check({ agent })
    await new Promise((r) => setTimeout(r, 1100))
    notifier.check({ agent })
    expect(findTag(notifications, "time")).toBeDefined()
  })

  test("context-pressure fires once per level crossing", async () => {
    const session = await Session.load({ store: new MemoryStore() })
    await session.start()
    const notifications: Omit<MetaPart, "type">[] = []
    let pressure: ContextPressure = { level: 0, limit: 100_000, ratio: 0, used: 0 }
    const agent = {
      session,
      notify: (m: Omit<MetaPart, "type">) => notifications.push(m),
      get pressure() {
        return pressure
      },
      model: { id: "x" },
    } as unknown as Agent
    const notifier = new Notifier()
    notifier.attach(agent)
    notifications.length = 0

    // Climb to level 1
    pressure = { level: 1, limit: 100_000, ratio: 0.78, used: 78_000 }
    notifier.check({ agent })
    expect(notifications.filter((n) => n.tag === "context-pressure")).toHaveLength(1)

    // Same level — should not re-fire
    pressure = { level: 1, limit: 100_000, ratio: 0.8, used: 80_000 }
    notifier.check({ agent })
    expect(notifications.filter((n) => n.tag === "context-pressure")).toHaveLength(1)

    // Climb to level 2 — fires again
    pressure = { level: 2, limit: 100_000, ratio: 0.86, used: 86_000 }
    notifier.check({ agent })
    expect(notifications.filter((n) => n.tag === "context-pressure")).toHaveLength(2)

    // Drop to 0 — resets the suppression
    pressure = { level: 0, limit: 100_000, ratio: 0.1, used: 10_000 }
    notifier.check({ agent })
    expect(notifications.filter((n) => n.tag === "context-pressure")).toHaveLength(2)

    // Climb back to level 1 — fires again because reset cleared suppression
    pressure = { level: 1, limit: 100_000, ratio: 0.78, used: 78_000 }
    notifier.check({ agent })
    expect(notifications.filter((n) => n.tag === "context-pressure")).toHaveLength(3)
  })

  test("context-pressure payload includes used, limit, pct", async () => {
    const session = await Session.load({ store: new MemoryStore() })
    await session.start()
    const notifications: Omit<MetaPart, "type">[] = []
    let pressure: ContextPressure = { level: 0, limit: 100_000, ratio: 0, used: 0 }
    const agent = {
      session,
      notify: (m: Omit<MetaPart, "type">) => notifications.push(m),
      get pressure() {
        return pressure
      },
      model: { id: "x" },
    } as unknown as Agent
    const notifier = new Notifier()
    notifier.attach(agent)
    notifications.length = 0

    pressure = { level: 1, limit: 200_000, ratio: 0.78, used: 156_000 }
    notifier.check({ agent })
    const note = findTag(notifications, "context-pressure")
    expect(note?.data).toEqual({ limit: 200_000, pct: 78, used: 156_000 })
  })
})
