import type { ProviderRequest, StreamEvent } from "@zaly/ai"

import { stringifyContent } from "@zaly/ai"
import { describe, expect, test, vi } from "vitest"
import { MemoryStore, Session } from "../src/session/index.ts"
import { loadAgent, mockModel } from "./helpers.ts"

function controlledModel() {
  type Request = {
    request: ProviderRequest
    finish: (input?: number) => void
    fail: (error: Error) => void
  }
  const model = mockModel([])
  const queue: Request[] = []
  const waiting: ((request: Request) => void)[] = []
  let count = 0
  model.provider.stream = async function* stream(request) {
    count++
    const result = Promise.withResolvers<StreamEvent[]>()
    const abort = () => result.reject(new DOMException("Request aborted", "AbortError"))
    request.opts.signal?.addEventListener("abort", abort, { once: true })
    const pending = {
      request,
      finish: (input = 100) =>
        result.resolve([
          { type: "text-delta", delta: "Answer" },
          { type: "finish", finishReason: "stop", usage: { input, output: 10 } },
        ]),
      fail: result.reject,
    }
    const next = waiting.shift()
    if (next) next(pending)
    else queue.push(pending)
    try {
      yield* await result.promise
    } finally {
      request.opts.signal?.removeEventListener("abort", abort)
    }
  }
  return {
    model,
    get count() {
      return count
    },
    next(): Promise<Request> {
      const request = queue.shift()
      return request ? Promise.resolve(request) : new Promise((resolve) => waiting.push(resolve))
    },
  }
}

async function setup(opts: { backgroundEnabled?: boolean; enabled?: boolean } = {}) {
  const pending = controlledModel()
  const agent = await loadAgent({
    model: pending.model,
    mask: { enabled: false },
    compaction: { keepTokens: 0, ...opts },
    messages: [{ role: "user", content: "original task" }],
  })
  return { agent, pending }
}

const isSummary = (request: ProviderRequest) =>
  request.ctx.prompt?.some((p) => p.includes("structured context checkpoint"))

describe("background compaction", () => {
  test("returns immediately, preserves status, and applies while idle", async () => {
    const { agent, pending } = await setup()
    agent.usage.add({ input: 1000, output: 10 })
    const applied = Promise.withResolvers<void>()
    agent.session.once("compact", () => applied.resolve())
    await agent.compact({ background: true })
    expect(agent.status).toBe("idle")
    expect(agent.contextSize).toBe(1010)
    const request = await pending.next()
    await agent.session.add({ role: "user", content: "arrived meanwhile" })
    request.finish()
    await applied.promise
    expect(agent.status).toBe("idle")
    expect(agent.contextSize).toBe(0)
    expect(agent.session.messages.at(-1)?.content).toBe("arrived meanwhile")
    const first = agent.session.messages[0]
    if (first.role !== "system") throw new Error("Expected the applied summary")
    expect(first.meta?.kind).toBe("compaction-summary")
  })

  test("blocking and background callers reuse one job and reset masking only after applying", async () => {
    const { agent, pending } = await setup()
    const masker = await agent.ctx.masker()
    const reset = masker ? vi.spyOn(masker, "reset") : undefined
    agent.usage.add({ input: 1000, output: 0 })
    await agent.compact({ background: true })
    await agent.compact({ background: true })
    const request = await pending.next()
    const done = agent.compact()
    expect(agent.status).toBe("compacting")
    expect(agent.contextSize).toBe(1000)
    expect(reset).not.toHaveBeenCalled()
    request.finish()
    await done
    expect(pending.count).toBe(1)
    expect(agent.contextSize).toBe(0)
    expect(reset).toHaveBeenCalledTimes(1)
    expect(agent.status).toBe("idle")
  })

  test("failed jobs preserve usage and surface their error to blocking callers", async () => {
    const { agent, pending } = await setup()
    agent.usage.add({ input: 1234, output: 0 })
    await agent.compact({ background: true })
    const request = await pending.next()
    const done = agent.compact().catch((error: unknown) => error)
    request.fail(new Error("summary failed"))
    expect(await done).toHaveProperty("message", "summary failed")
    expect(agent.contextSize).toBe(1234)
    expect(agent.session.messages).toHaveLength(1)
    expect(agent.status).toBe("idle")
  })

  test("normal completion survives an overlapping compaction without restoring stale pressure", async () => {
    const { agent, pending } = await setup({ backgroundEnabled: false })
    const step = agent.step()
    const foreground = await pending.next()
    await agent.compact({ background: true })
    const summary = await pending.next()
    const done = agent.compact()
    summary.finish()
    await done
    expect(agent.status).toBe("streaming")
    foreground.finish(900_000)
    await step
    expect(agent.contextSize).toBe(0)
    expect(agent.totalUsage.input).toBe(900_000)
    expect(agent.session.messages.at(-1)?.role).toBe("assistant")
  })

  test("the next request uses the applied summary and refreshes pressure normally", async () => {
    const { agent, pending } = await setup({ backgroundEnabled: false })
    const compact = agent.compact()
    const summary = await pending.next()
    summary.finish()
    await compact
    const step = agent.step()
    const foreground = await pending.next()
    const first = foreground.request.ctx.messages[0]
    if (first.role !== "system") throw new Error("Expected the applied summary")
    expect(stringifyContent(first.content)).toContain("compaction-summary")
    foreground.finish(456)
    await step
    expect(agent.contextSize).toBe(466)
  })

  test("automatic background compaction starts after usage and survives natural turn completion", async () => {
    const { agent, pending } = await setup()
    const step = agent.run()
    const foreground = await pending.next()
    foreground.finish(Math.floor(agent.pressure.limit * 0.91))
    await step
    expect(agent.status).toBe("idle")
    const summary = await pending.next()
    expect(isSummary(summary.request)).toBe(true)
    const done = agent.compact()
    summary.finish()
    await done
    expect(pending.count).toBe(2)
  })

  test.each([{ enabled: false }, { backgroundEnabled: false }])(
    "automatic background work respects %j",
    async (opts) => {
      const { agent, pending } = await setup(opts)
      const step = agent.step()
      const foreground = await pending.next()
      foreground.finish(Math.floor(agent.pressure.limit * 0.91))
      await step
      expect(pending.count).toBe(1)
    }
  )

  test("blocking threshold waits for the existing background job before making a request", async () => {
    const { agent, pending } = await setup()
    await agent.compact({ background: true })
    const summary = await pending.next()
    agent.usage.add({ input: agent.pressure.limit, output: 0 })
    const step = agent.step()
    expect(agent.status).toBe("compacting")
    summary.finish()
    const foreground = await pending.next()
    expect(isSummary(foreground.request)).not.toBe(true)
    foreground.finish()
    await step
    expect(pending.count).toBe(2)
  })

  test("stale snapshots do not replace a navigated session", async () => {
    const { agent, pending } = await setup()
    const first = agent.session.messages[0].id!
    await agent.session.add({ role: "user", content: "second" })
    await agent.compact({ background: true })
    const summary = await pending.next()
    const done = agent.compact().catch((error: unknown) => error)
    await agent.session.checkout(first)
    summary.finish()
    expect(await done).toHaveProperty("message", expect.stringMatching(/active history/))
    expect(agent.session.messages).toHaveLength(1)
    expect(agent.session.messages[0].content).toBe("original task")
  })

  test("session replacement cancels background work without applying it elsewhere", async () => {
    const { agent, pending } = await setup()
    await agent.compact({ background: true })
    const summary = await pending.next()
    const done = agent.compact().catch((error: unknown) => error)
    const session = await Session.load({ store: new MemoryStore() })
    await session.add({ role: "user", content: "new task" })
    await agent.ctx.useSession(session)
    expect(await done).toHaveProperty("message", expect.stringMatching(/aborted/i))
    expect(summary.request.opts.signal?.aborted).toBe(true)
    expect(agent.session.messages[0].content).toBe("new task")
  })

  test.each([false, true])(
    "overflow reuses an overlapping compaction (already applied=%s)",
    async (appliedFirst) => {
      const { agent, pending } = await setup({ backgroundEnabled: false })
      const run = agent.run()
      const foreground = await pending.next()
      const applied = Promise.withResolvers<void>()
      agent.session.once("compact", () => applied.resolve())
      await agent.compact({ background: true })
      const summary = await pending.next()
      if (appliedFirst) {
        summary.finish()
        await applied.promise
      }
      foreground.fail(new Error("This model's maximum context length is 8192 tokens."))
      if (!appliedFirst) summary.finish()
      const retry = await pending.next()
      expect(isSummary(retry.request)).not.toBe(true)
      retry.finish()
      await run
      expect(pending.count).toBe(3)
      expect(agent.contextSize).toBe(110)
    }
  )

  test("a no-op compaction does not clear usage", async () => {
    const pending = controlledModel()
    const agent = await loadAgent({ model: pending.model, messages: [], mask: { enabled: false } })
    agent.usage.add({ input: 123, output: 0 })
    await agent.compact()
    expect(agent.contextSize).toBe(123)
    expect(pending.count).toBe(0)
  })

  test("background completion does not abort or change the foreground request", async () => {
    const { agent, pending } = await setup({ backgroundEnabled: false })
    const step = agent.step()
    const foreground = await pending.next()
    const applied = Promise.withResolvers<void>()
    agent.session.once("compact", () => applied.resolve())
    await agent.compact({ background: true })
    const summary = await pending.next()
    summary.finish()
    await applied.promise
    expect(agent.status).toBe("streaming")
    expect(foreground.request.opts.signal?.aborted).toBe(false)
    foreground.finish()
    await step
  })

  test("a failed background attempt is not retried against the same unchanged history", async () => {
    const { agent, pending } = await setup()
    agent.usage.add({ input: Math.floor(agent.pressure.limit * 0.91), output: 0 })
    await agent.compact({ background: true })
    const summary = await pending.next()
    const failed = agent.compact().catch((error: unknown) => error)
    summary.fail(new Error("failed"))
    await failed
    const step = agent.step()
    const foreground = await pending.next()
    expect(isSummary(foreground.request)).not.toBe(true)
    foreground.finish(100)
    await step
    expect(pending.count).toBe(2)
  })

  test("explicit blocking calls still wait when automatic compaction is disabled", async () => {
    const { agent, pending } = await setup({ enabled: false })
    const done = agent.compact()
    const summary = await pending.next()
    expect(agent.status).toBe("compacting")
    summary.finish()
    await done
    expect(agent.session.messages[0].role).toBe("system")
  })

  test("manual compaction does not inherit a previously aborted foreground signal", async () => {
    const { agent, pending } = await setup({ backgroundEnabled: false })
    const step = agent.step()
    const foreground = await pending.next()
    agent.stop()
    await step
    expect(foreground.request.opts.signal?.aborted).toBe(true)
    const done = agent.compact()
    const summary = await pending.next()
    expect(summary.request.opts.signal?.aborted).toBe(false)
    summary.finish()
    await done
    expect(agent.session.messages[0].role).toBe("system")
  })

  test("explicit stop also cancels a newly started blocking compaction", async () => {
    const { agent, pending } = await setup()
    const done = agent.compact().catch((error: unknown) => error)
    const summary = await pending.next()
    agent.stop()
    expect(await done).toHaveProperty("message", expect.stringMatching(/aborted/i))
    expect(summary.request.opts.signal?.aborted).toBe(true)
  })

  test("records pre-compaction usage from the captured pressure, not concurrent activity", async () => {
    const { agent, pending } = await setup()
    const masker = await agent.ctx.masker()
    const preparing = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    vi.spyOn(agent.ctx, "masker").mockImplementationOnce(async () => {
      preparing.resolve()
      await release.promise
      return masker
    })
    agent.usage.add({ input: 1000, output: 10 })
    let preTokens: number | undefined
    agent.session.once("compact", ({ node }) => {
      preTokens = node.preTokens
    })
    const done = agent.compact()
    await preparing.promise
    agent.usage.add({ input: 5000, output: 10 })
    release.resolve()
    const summary = await pending.next()
    summary.finish()
    await done
    expect(preTokens).toBe(1010)
  })

  test("explicit stop cancels a background request", async () => {
    const { agent, pending } = await setup()
    await agent.compact({ background: true })
    const summary = await pending.next()
    const done = agent.compact().catch((error: unknown) => error)
    agent.stop()
    expect(await done).toHaveProperty("message", expect.stringMatching(/aborted/i))
    expect(summary.request.opts.signal?.aborted).toBe(true)
    expect(agent.session.messages[0].role).toBe("user")
  })
})
