import type { Agent } from "../src/agent.ts"

import { describe, expect, test } from "vitest"
import { Swarm } from "../src/swarm.ts"
import { loadAgent, mockModel } from "./helpers.ts"

const buildRoot = async (): Promise<Agent> =>
  loadAgent({ model: mockModel([]), skills: false })

// The swarm injects via `agent.inject(...)` which queues into
// `#injectQueue` while the agent is non-idle; for an idle agent it
// falls through to `send()` which commits to the session immediately.
// Our mock agents are idle, so injected messages land in `agent.messages`.
// Inject paths commit to the session asynchronously (fire-and-forget
// against `session.add`). Tests calling `swarm.send` synchronously and
// then reading `agent.messages` must drain microtasks first.
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
const lastInjectedMsg = (a: Agent) => a.messages.at(-1)

/** Pull the structured `<agent>` message + its sender meta + body text
 *  + role out of the receiver's last injected message. Throws on shape
 *  mismatch so the calling test fails clearly. */
function readAgentInject(a: Agent): {
  from: string
  id?: string
  text: string
  role: "user" | "system"
} {
  const msg = lastInjectedMsg(a)
  if (msg?.role !== "system" && msg?.role !== "user") {
    throw new Error("expected user or system message")
  }
  if (typeof msg.content === "string") throw new Error("expected structured content")
  let metaData: { from: string; id?: string } | undefined
  let bodyText = ""
  for (const p of msg.content) {
    if (p.type === "meta") metaData = p.data as { from: string; id?: string }
    else if (p.type === "text") bodyText = p.text
  }
  if (!metaData) throw new Error("expected <agent> meta part")
  return { from: metaData.from, id: metaData.id, role: msg.role, text: bodyText }
}

describe("Swarm — registry", () => {
  test("attach registers an agent; id equals the resolved name", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    const entry = swarm.attach(root, { desc: "the orchestrator", name: "root" })
    expect(entry.id).toBe("root")
    expect(entry.name).toBe("root")
    expect(entry.agent.parent).toBeUndefined()
    expect(swarm.get("root")).toBe(entry)
    expect(swarm.find(root)).toBe(entry)
  })

  test("attach auto-suffixes on name collision", async () => {
    const root = await buildRoot()
    const a = await root.child({ model: mockModel([]) })
    const b = await root.child({ model: mockModel([]) })
    const c = await root.child({ model: mockModel([]) })
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })
    const first = swarm.attach(a, { desc: "x", name: "reviewer" })
    const second = swarm.attach(b, { desc: "x", name: "reviewer" })
    const third = swarm.attach(c, { desc: "x", name: "reviewer" })
    expect(first.name).toBe("reviewer")
    expect(second.name).toBe("reviewer-2")
    expect(third.name).toBe("reviewer-3")
  })

  test("stop frees the name for re-use", async () => {
    const root = await buildRoot()
    const a = await root.child({ model: mockModel([]) })
    const b = await root.child({ model: mockModel([]) })
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })
    const first = swarm.attach(a, { desc: "x", name: "reviewer" })
    swarm.stop(first.id)
    const second = swarm.attach(b, { desc: "x", name: "reviewer" })
    expect(second.name).toBe("reviewer") // not "reviewer-2"
  })

  test('attach throws on empty name and on reserved "user"', async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    expect(() => swarm.attach(root, { desc: "x", name: "" })).toThrow(/non-empty/)
    expect(() => swarm.attach(root, { desc: "x", name: "user" })).toThrow(/reserved/)
  })

  test("entries lists every registered agent", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })
    expect(swarm.entries).toHaveLength(1)
  })

  test("attach is idempotent — re-attaching returns the existing entry", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    const first = swarm.attach(root, { desc: "first desc", name: "root" })
    const second = swarm.attach(root, { desc: "second desc", name: "renamed" })
    expect(second).toBe(first) // same entry instance
    expect(second.name).toBe("root") // first call wins
    expect(swarm.entries).toHaveLength(1)
  })
})

describe("Swarm — spawn", () => {
  test("spawn creates a child Agent and registers it under the parent", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })

    const entry = await swarm.spawn(root, {
      desc: "review the auth code",
      name: "reviewer",
      prompt: "You are a code reviewer.",
    })

    expect(entry.name).toBe("reviewer")
    expect(entry.desc).toBe("review the auth code")
    expect(entry.agent.parent).toBe(root)
    expect(entry.agent.depth).toBe(1)
    expect(swarm.children(root)).toHaveLength(1)
    expect(swarm.children(root)[0]).toBe(entry)
  })

  test("spawn with `task` sends an initial user message to the child", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })

    const entry = await swarm.spawn(root, {
      desc: "x",
      name: "x",
      prompt: "p",
      task: "do the thing",
    })
    // Child is idle (mock model has no scripts); the task lands in its
    // session as the first user message.
    const msgs = entry.agent.messages
    const userMsg = msgs.find((m) => m.role === "user")
    expect(userMsg?.content).toBe("do the thing")
  })

  test("nested spawn: subagent's child registers with subagent as parent", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })
    const child = await swarm.spawn(root, { desc: "x", name: "child", prompt: "p" })
    const grand = await swarm.spawn(child.agent, {
      desc: "x",
      name: "grandchild",
      prompt: "p",
    })
    expect(grand.agent.parent).toBe(child.agent)
    expect(grand.agent.depth).toBe(2)
    expect(swarm.children(child.agent)).toHaveLength(1)
    expect(swarm.children(root)).toHaveLength(1) // only direct children
  })
})

describe("Swarm — send", () => {
  test("parent → child lands as a plain role:user message (no <agent> wrapper)", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "the orchestrator", name: "root" })
    const child = await swarm.spawn(root, { desc: "x", name: "reviewer", prompt: "p" })

    swarm.send(root, child.agent, "focus on auth.ts")
    await flush()

    // Receiver's only upstream sender is its parent — no disambiguation
    // needed, the `<agent>` wrapper is dropped and content is a plain
    // string. Same shape as if a human had typed it.
    const msg = lastInjectedMsg(child.agent)
    expect(msg?.role).toBe("user")
    expect(msg?.content).toBe("focus on auth.ts")
  })

  test('"user" → root lands as a plain role:user message (no <agent> wrapper)', async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })

    swarm.send("user", root, "go run the tests")
    await flush()

    const msg = lastInjectedMsg(root)
    expect(msg?.role).toBe("user")
    expect(msg?.content).toBe("go run the tests")
  })

  test("child → parent uses role:system (a report, not a directive)", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })
    const child = await swarm.spawn(root, { desc: "x", name: "reviewer", prompt: "p" })

    swarm.send(child.agent, root, "found 3 issues")
    await flush()
    const inject = readAgentInject(root)
    expect(inject.role).toBe("system")
    expect(inject.from).toBe("reviewer")
  })

  test("send from an unregistered agent falls back to a generic identity", async () => {
    const root = await buildRoot()
    const orphan = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })

    swarm.send(orphan, root, "hi")
    await flush()
    const inject = readAgentInject(root)
    expect(inject.from).toBe("agent")
    expect(inject.id).toBeUndefined()
  })
})

describe("Swarm — auto-forward on natural step-end", () => {
  test("child's outward text reaches parent as a system message", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })

    // Build a child via `root.child(...)` so `child.parent === root`
    // is set the same way production does. We override the model so
    // the child has its own script (parent's mock is empty).
    const childAgent = await root.child({
      model: mockModel([
        [
          { delta: "found ", type: "text-delta" },
          { delta: "3 issues", type: "text-delta" },
          { finishReason: "stop", type: "finish", usage: { input: 1, output: 1 } },
        ],
      ]),
    })
    swarm.attach(childAgent, { desc: "x", name: "reviewer" })

    childAgent.send({ content: "review", role: "user" })
    await childAgent.run()

    const inject = readAgentInject(root)
    expect(inject.role).toBe("system")
    expect(inject.from).toBe("reviewer")
    expect(inject.text).toBe("found 3 issues")
  })

  test("does NOT forward on tool-calls outcomes (only natural)", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })

    // A child that wants to call a tool — outcome would be `tool-calls`,
    // not `natural`. Our forwarder skips this. Since we don't supply
    // the tool, the child errors out — but that's fine, we just want
    // to confirm no inject happens before the natural-stop boundary.
    const childAgent = await root.child({
      model: mockModel([
        [
          { id: "c1", name: "missing-tool", params: {}, type: "tool-call" },
          { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
        ],
        // Step 2 — model gives up, stops naturally with text.
        [
          { delta: "i'm stuck", type: "text-delta" },
          { finishReason: "stop", type: "finish", usage: { input: 1, output: 1 } },
        ],
      ]),
    })
    swarm.attach(childAgent, { desc: "x", name: "stuck" })

    childAgent.send({ content: "go", role: "user" })
    await childAgent.run()

    // Only one forwarded message — from step 2's natural stop, not
    // step 1's tool-calls outcome.
    const inject = readAgentInject(root)
    expect(inject.text).toBe("i'm stuck")
  })

  test("attach on a parent-less agent (root) does not wire forwarding", async () => {
    const swarm = new Swarm()
    const root = await buildRoot()
    swarm.attach(root, { desc: "x", name: "root" })
    // Root has no `agent.parent`, so the forwarder is a no-op. The
    // entry is registered, just without a step-end listener.
    expect(swarm.find(root)).toBeDefined()
    expect(root.parent).toBeUndefined()
  })
})

describe("Swarm — stop", () => {
  test("stop removes the entry", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })
    const child = await swarm.spawn(root, { desc: "x", name: "x", prompt: "p" })

    swarm.stop(child.id)
    expect(swarm.get(child.id)).toBeUndefined()
    expect(swarm.children(root)).toHaveLength(0)
  })

  test("stop on unknown id is a silent no-op", () => {
    const swarm = new Swarm()
    expect(() => swarm.stop("nope")).not.toThrow()
  })

  test("stopAll clears every entry", async () => {
    const root = await buildRoot()
    const swarm = new Swarm()
    swarm.attach(root, { desc: "x", name: "root" })
    await swarm.spawn(root, { desc: "x", name: "a", prompt: "p" })
    await swarm.spawn(root, { desc: "x", name: "b", prompt: "p" })
    expect(swarm.entries).toHaveLength(3)
    swarm.stopAll()
    expect(swarm.entries).toHaveLength(0)
  })
})
