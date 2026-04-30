import type { Message, StreamEvent } from "@zaly/ai"
import type { Envelope } from "@zaly/shared"
import type { AgentEvents, AgentStopReason } from "../src/events.ts"

import { defineTool } from "@zaly/ai"
import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { Session } from "../src/session/index.ts"
import { loadAgent, mockModel, pendingModel } from "./helpers.ts"

const Add = defineTool({
  call: ({ a, b }) => a + b,
  name: "add",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
})

/** Stream events for a model that says "ok" and stops naturally. */
function okStop(): StreamEvent[] {
  return [
    { delta: "ok", type: "text-delta" },
    { finishReason: "stop", type: "finish", usage: { input: 1, output: 1 } },
  ]
}

describe("Agent — send/inject queueing", () => {
  test("send() during a running turn queues, drains after natural stop", async () => {
    const m = pendingModel()
    const agent = await loadAgent({
      messages: [{ content: "first", role: "user" }],
      model: m.model,
    })
    const run = agent.run()

    // Wait for the agent to actually be streaming the first turn.
    while (m.pending === 0) await tick()

    // Send a follow-up while the first turn is in flight.
    agent.send({ content: "second", role: "user" })

    // Finish the first turn naturally — the loop should pick up the
    // queued message, append it, and run another step.
    m.release(okStop())
    while (m.pending === 0) await tick()
    m.release(okStop())

    expect(await run).toBe("natural")
    const userTurns = agent.messages.filter((msg) => msg.role === "user")
    expect(userTurns.map((u) => u.content)).toEqual(["first", "second"])
    expect(agent.steps).toBe(2)
  })

  test("inject() during a running turn lands before the next step", async () => {
    const m = pendingModel()
    const agent = await loadAgent({
      messages: [{ content: "first", role: "user" }],
      model: m.model,
      tools: [Add],
    })
    const run = agent.run()

    while (m.pending === 0) await tick()

    // Inject — should be queued for the next step (not the current one).
    agent.inject({ content: "skip tests", role: "user" })

    // First turn ends with a tool call so the loop doesn't stop naturally.
    m.release([
      { params: { a: 1, b: 2 }, id: "c1", name: "add", type: "tool-call" },
      { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
    ])

    // Next stream sees the injected message in the prompt before running.
    while (m.pending === 0) await tick()
    m.release(okStop())

    expect(await run).toBe("natural")
    // Order: first user → assistant(tool-call) → tool result → injected user → assistant
    const roles = agent.messages.map((msg) => msg.role)
    expect(roles).toEqual(["user", "assistant", "tool", "user", "assistant"])
    const injected = agent.messages[3] as Message<"user">
    expect(injected.content).toBe("skip tests")
  })

  test("send() while idle starts the loop immediately", async () => {
    const agent = await loadAgent({ model: mockModel([okStop()]) })
    agent.send({ content: "go", role: "user" })
    // run() returns the in-flight promise — wait it out via run().
    const reason = await agent.run()
    expect(reason).toBe("natural")
    expect(agent.messages.map((m) => m.role)).toEqual(["user", "assistant"])
  })
})

describe("Agent — pause / abort", () => {
  test("pause() between steps stops with reason 'paused'; resume drains queue", async () => {
    const m = pendingModel()
    const agent = await loadAgent({
      messages: [{ content: "go", role: "user" }],
      model: m.model,
      tools: [Add],
    })
    const run = agent.run()

    // First step ends with a tool call; loop will check pause flag before next step.
    while (m.pending === 0) await tick()
    agent.pause()
    m.release([
      { params: { a: 1, b: 2 }, id: "c1", name: "add", type: "tool-call" },
      { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
    ])

    expect(await run).toBe("paused")
    expect(agent.status).toBe("paused")

    // Resume with a follow-up message; loop continues from where it stopped.
    agent.send({ content: "continue", role: "user" })
    while (m.pending === 0) await tick()
    m.release(okStop())
    expect(await agent.run()).toBe("natural")
  })

  test("abort() kills the in-flight stream; lands paused with AbortError", async () => {
    const m = pendingModel()
    const agent = await loadAgent({
      messages: [{ content: "go", role: "user" }],
      model: m.model,
    })
    const run = agent.run()

    while (m.pending === 0) await tick()
    agent.abort()

    // The aborted stream wins; we still need to release it so the awaiting
    // generator unblocks (the abort signal isn't observed by our mock).
    m.release([{ error: new DOMException("aborted", "AbortError"), type: "error" }])

    expect(await run).toBe("aborted")
    expect(agent.status).toBe("paused")
    expect(agent.lastError?.name).toBe("AbortError")
  })
})

describe("Agent — compact callback", () => {
  test("recovers from context-overflow when a compact callback is supplied", async () => {
    // Step 1 silently overflows (input > contextLimit). Compact callback
    // condenses history; step 2 fits and stops naturally.
    const model = mockModel([
      [{ finishReason: "stop", type: "finish", usage: { input: 9000, output: 5 } }],
      [
        { delta: "ok", type: "text-delta" },
        { finishReason: "stop", type: "finish", usage: { input: 100, output: 5 } },
      ],
    ])
    let compactCalls = 0
    const agent = await loadAgent({
      compact: (a) => {
        compactCalls++
        a.session.compact({ trigger: "auto" })
        a.session.add({ content: "summary", role: "system" })
      },
      contextLimit: 8000,
      messages: [{ content: "go", role: "user" }],
      model,
    })

    const reason = await agent.run()
    expect(reason).toBe("natural")
    expect(compactCalls).toBe(1)
    // After compaction, active chain should start with the summary system
    // message, then the assistant reply that succeeded post-compact.
    expect(agent.messages.map((m) => m.role)).toEqual(["system", "assistant"])
  })

  test("without a compact callback, overflow stops the loop", async () => {
    const model = mockModel([
      [{ finishReason: "stop", type: "finish", usage: { input: 9000, output: 5 } }],
    ])
    const agent = await loadAgent({
      contextLimit: 8000,
      messages: [{ content: "go", role: "user" }],
      model,
    })
    expect(await agent.run()).toBe("context-overflow")
  })
})

describe("Agent — emitted events", () => {
  test("emits status / stream-event / step-end / stop in order on a single turn", async () => {
    const seen: Envelope<AgentEvents>["type"][] = []
    const agent = await loadAgent({
      messages: [{ content: "go", role: "user" }],
      model: mockModel([okStop()]),
    })
    agent.all((e) => seen.push(e.type))
    await agent.run()

    // Expect at least: streaming → stream-event → text-delta + finish → step-end → stop
    expect(seen).toContain("status")
    expect(seen).toContain("stream-event")
    expect(seen).toContain("step-end")
    expect(seen.at(-1)).toBe("stop")
  })

  test("emits tool-call + tool-result around tool dispatch", async () => {
    const calls: string[] = []
    const results: string[] = []
    const agent = await loadAgent({
      messages: [{ content: "go", role: "user" }],
      model: mockModel([
        [
          { params: { a: 2, b: 3 }, id: "c1", name: "add", type: "tool-call" },
          { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
        ],
        okStop(),
      ]),
      tools: [Add],
    })
    agent.on("tool-call", (e) => calls.push(e.call.name))
    agent.on("tool-result", (e) => {
      const c = e.result.content
      const text =
        typeof c === "string" ? c : c.map((p) => (p.type === "text" ? p.text : "")).join("")
      results.push(text)
    })
    await agent.run()
    expect(calls).toEqual(["add"])
    expect(results).toEqual(["5"])
  })

  test("session emits a node event for the assistant reply committed by the agent", async () => {
    // session-start + initialMessages fire synchronously inside the Agent
    // constructor — before we can attach a listener — so we observe only
    // the messages that land *after* construction.
    const sessionNodes: string[] = []
    const agent = await loadAgent({
      messages: [{ content: "go", role: "user" }],
      model: mockModel([okStop()]),
    })
    agent.session.on("node", (e) => {
      if (e.node.type === "message") sessionNodes.push(e.node.message.role)
    })
    await agent.run()
    expect(sessionNodes).toEqual(["assistant"])
  })
})

describe("Agent — persistence integration", () => {
  test("a persisted Session can be reloaded and resumed by a new Agent", async () => {
    const file = `${process.env.TMPDIR ?? "/tmp"}/zaly-agent-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`

    // First Agent: run a single turn against a persisted session.
    // (When `session` is supplied, `initialMessages` is ignored — the
    //  session is the source of truth. Seed via `send()` instead.)
    const agent1 = await loadAgent({
      model: mockModel([okStop()]),
      session: { path: file },
    })
    agent1.send({ content: "round 1", role: "user" })
    await agent1.run()
    await agent1.session.close()

    // Reload the session from disk; messages should round-trip.
    const session2 = await Session.load({ path: file })
    expect(session2.messages.map((m) => m.role)).toEqual(["user", "assistant"])

    // Second Agent picks up the same session and continues.
    const agent2 = await loadAgent({ model: mockModel([okStop()]), session: session2 })
    agent2.send({ content: "round 2", role: "user" })
    await agent2.run()
    await session2.close()

    expect(agent2.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"])
  })
})

describe("Agent — mutable prompt + tools", () => {
  test("prompt setter applies to the next step's request", async () => {
    let lastPrompt: string[] | undefined
    const recordingModel = {
      id: "mock/x",
      options: {} as never,
      provider: {} as never,
      async *stream(req: { prompt?: string[] }) {
        lastPrompt = req.prompt
        yield {
          finishReason: "stop" as const,
          type: "finish" as const,
          usage: { input: 1, output: 1 },
        }
      },
    } as never
    const agent = await loadAgent({ model: recordingModel, prompt: ["original"] })
    agent.send({ content: "go", role: "user" })
    await agent.run()
    expect(lastPrompt).toEqual(["original"])

    agent.prompt = ["updated"]
    agent.send({ content: "again", role: "user" })
    await agent.run()
    expect(lastPrompt).toEqual(["updated"])
    expect(agent.prompt).toEqual(["updated"])
  })

  test("tools setter rebuilds the dispatch table", async () => {
    const Sub = defineTool({
      call: ({ a, b }) => a - b,
      name: "sub",
      params: Type.Object({ a: Type.Number(), b: Type.Number() }),
    })
    const agent = await loadAgent({
      model: mockModel([
        [
          { params: { a: 5, b: 2 }, id: "c1", name: "sub", type: "tool-call" },
          { finishReason: "tool-calls", type: "finish", usage: { input: 1, output: 1 } },
        ],
        okStop(),
      ]),
      tools: [Add],
    })
    // Swap the available set before the call lands so "sub" can dispatch.
    agent.tools = [Sub]
    expect(agent.tools.map((t) => t.name)).toEqual(["sub"])
    agent.send({ content: "go", role: "user" })
    await agent.run()
    const toolMsg = agent.messages[2] as Message<"tool">
    expect(toolMsg.content[0].content).toEqual([{ format: "json", text: "3", type: "text" }])
    expect(toolMsg.content[0].isError).toBe(false)
  })
})

describe("Agent — final-state APIs", () => {
  test("lastStopReason and totalUsage stay accessible after run()", async () => {
    const agent = await loadAgent({
      messages: [{ content: "go", role: "user" }],
      model: mockModel([
        [{ finishReason: "stop", type: "finish", usage: { input: 7, output: 3 } }],
      ]),
    })
    const reason: AgentStopReason = await agent.run()
    expect(reason).toBe("natural")
    expect(agent.lastStopReason).toBe("natural")
    expect(agent.totalUsage).toEqual({ input: 7, output: 3 })
    expect(agent.contextSize).toBe(10)
  })
})

describe("Agent — wakeup queue draining", () => {
  test("wakeup that fires during streaming surfaces in the SAME run, not the next user turn", async () => {
    const m = pendingModel()
    const agent = await loadAgent({ model: m.model })
    const run = agent.run()

    // Wait for the first stream to be in flight (status=streaming).
    while (m.pending === 0) await tick()

    // Schedule a wakeup with a tiny delay, then deliver the stream's
    // natural-stop AFTER the timer has had a chance to fire. The timer
    // callback runs while status is still `streaming`, so `inject`
    // pushes the wakeup into `#injectQueue` rather than via `send`.
    agent.scheduleWakeup({ delayMs: 1, hint: "tick" })
    await new Promise((r) => setTimeout(r, 5))

    // First stream ends naturally. Pre-fix this stopped the loop with
    // the wakeup orphaned in `#injectQueue`. Post-fix the loop continues
    // and the next step drains it.
    m.release(okStop())

    // The continuation step needs another stream — release it too.
    while (m.pending === 0) await tick()
    m.release(okStop())

    const reason = await run
    expect(reason).toBe("natural")

    const roles = agent.messages.map((msg) => msg.role)
    // user-driven kickoff is absent (this run started with no messages),
    // so we expect: assistant (initial), system (wakeup drained), assistant.
    expect(roles).toEqual(["assistant", "system", "assistant"])

    const wakeup = agent.messages[1]
    if (wakeup.role !== "system" || typeof wakeup.content === "string") {
      throw new Error("expected structured system wakeup message")
    }
    const meta = wakeup.content[0]
    expect(meta.type).toBe("meta")
    if (meta.type !== "meta") throw new Error("type narrow")
    expect(meta.tag).toBe("wakeup")
    // Crucially: NOT cancelled — this was an organic fire, not
    // `#cancelAllWakeups`.
    expect((meta.data as { status?: string }).status).toBeUndefined()
  })
})

function tick(): Promise<void> {
  return new Promise((res) => setTimeout(res, 0))
}
