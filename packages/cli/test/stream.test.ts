import type { AgentContextEvents, AgentEvents } from "@zaly/agent"
import type { SessionEvents } from "@zaly/agent/session"
import type { StreamEvent, ToolCallPart } from "@zaly/ai"
import type { Node } from "@zaly/tui"
import type { App } from "../src/app/app.ts"

import { Emitter } from "@zaly/shared"
import { stripAnsi } from "@zaly/shared/ansi"
import { createCtx } from "@zaly/tui"
import { afterEach, expect, test, vi } from "vitest"
import { attachStream } from "../src/app/stream.ts"

const ai = await import("@zaly/ai")

const streams: ReturnType<typeof attachStream>[] = []
afterEach(() => {
  for (const stream of streams.splice(0)) stream.reset()
  vi.restoreAllMocks()
})

async function setup() {
  const nodes: Node[] = []
  const ctx = await createCtx({ width: 160 })
  const agent = Object.assign(new Emitter<AgentEvents>(), {
    ctx: Object.assign(new Emitter<AgentContextEvents>(), { cwd: process.cwd() }),
    session: new Emitter<SessionEvents>(),
  })
  const app = {
    agent,
    $: { ui: { collapsedTools: [], reasoning: true } },
    renderer: {
      stream: {
        append: (create: () => Node) => {
          const node = create()
          nodes.push(node)
          return node
        },
      },
    },
  } as unknown as App
  const stream = attachStream(app)
  streams.push(stream)
  const output = async () => {
    const rows = await Promise.all(nodes.map((node) => node.render(ctx)))
    return stripAnsi(rows.flat().join("\n"))
  }
  return {
    agent,
    nodes,
    stream,
    event: (event: StreamEvent) => agent.emit("stream-event", { event }),
    output,
    contains: async (text: string) => {
      const rendered = await output()
      return rendered.includes(text)
    },
  }
}

async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 2000
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for streamed preview")
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

const delta = (
  args: string,
  extra: Partial<Extract<StreamEvent, { type: "tool-call-delta" }>> = {}
): StreamEvent => ({
  type: "tool-call-delta",
  key: "0",
  id: "call-0",
  name: "write",
  args,
  ...extra,
})
const call = (id = "call-0", path = "final.py"): ToolCallPart => ({
  type: "tool-call",
  id,
  name: "write",
  params: { path, content: "written content\n" },
})

test("partial JSON shows a write destination before finalization and reuses its widget", async () => {
  const view = await setup()
  await view.event(delta('{"path":"early.py","content":"unfinished'))
  expect(view.nodes).toHaveLength(1)
  await until(() => view.contains("early.py"))
  const node = view.nodes[0]
  await view.event(call())
  await view.agent.emit("tool-calls", { calls: [call()] })
  expect(view.nodes).toEqual([node])
  expect(await view.output()).toContain("final.py")
  expect(await view.output()).not.toContain("early.py")
  await view.agent.emit("tool-result", {
    call: call(),
    result: { content: "ok", meta: { path: "final.py", original: "" } },
  })
  expect(await view.output()).toContain("written content")
})

test("name and id can arrive after the first argument fragments", async () => {
  const view = await setup()
  await view.event({ type: "tool-call-delta", key: "0", delta: '{"path":"late.py"' })
  expect(view.nodes).toHaveLength(0)
  await view.event({
    type: "tool-call-delta",
    key: "0",
    id: "late",
    name: "write",
    delta: ',"content":"body',
  })
  await until(() => view.contains("late.py"))
  await view.event(call("late", "complete.py"))
  expect(view.nodes).toHaveLength(1)
  expect(await view.output()).toContain("complete.py")
})

test("parallel same-name calls and interleaved text retain their own previews/results", async () => {
  const view = await setup()
  await view.event(delta('{"path":"one.py"}'))
  await view.event({ type: "text-delta", delta: "between calls" })
  await view.event(delta('{"path":"two.py"}', { key: "1", id: "call-1" }))
  await until(async () => {
    const output = await view.output()
    return output.includes("one.py") && output.includes("two.py")
  })
  await view.agent.emit("tool-calls", {
    calls: [call("call-1", "two.py"), call("call-0", "one.py")],
  })
  await view.agent.emit("tool-result", {
    call: call("call-1", "two.py"),
    result: { content: "ok", meta: { original: "", path: "two.py" } },
  })
  await view.output()
  expect(view.nodes[0].state.sticky).toBe(true)
  expect(view.nodes[2].state.sticky).toBe(false)
  await view.agent.emit("tool-result", {
    call: call("call-0", "one.py"),
    result: { content: "ok", meta: { original: "", path: "one.py" } },
  })
  expect(view.nodes).toHaveLength(3)
  expect(await view.output()).toContain("between calls")
  const output = await view.output()
  expect(output.match(/written content/g)).toHaveLength(2)
})

test("complete calls without deltas still render normally", async () => {
  const view = await setup()
  await view.agent.emit("tool-calls", { calls: [call()] })
  expect(view.nodes).toHaveLength(1)
  expect(await view.output()).toContain("final.py")
})

test("generic call parameters and descriptions update reactively", async () => {
  const view = await setup()
  await view.event(
    delta('{"command":"echo first","description":"First command"}', { name: "bash" })
  )
  await until(() => view.contains("First command"))
  await view.event(
    delta('{"command":"echo second","description":"Second command"}', { name: "bash" })
  )
  await until(() => view.contains("Second command"))
  const output = await view.output()
  expect(output).toContain("echo second")
  expect(output).not.toContain("First command")
  expect(output).not.toContain("echo first")
})

test("failed or non-object repairs preserve the last usable parameter preview", async () => {
  const view = await setup()
  const parse = vi.spyOn(ai, "parseJson")
  await view.event(delta('{"path":"keep.py"}'))
  await until(() => view.contains("keep.py"))
  await view.event(delta("not an object"))
  await until(() => parse.mock.calls.length >= 1)
  expect(await view.output()).toContain("keep.py")
})

test("step completion settles unfinished previews and permits reuse of delta keys", async () => {
  const view = await setup()
  await view.event(delta('{"path":"first.py"}'))
  await until(() => view.contains("first.py"))
  await view.agent.emit("step-end", { step: 0, outcome: "error" })
  expect(view.nodes[0].state.sticky).toBe(false)
  await view.event(delta('{"path":"second.py"}'))
  await until(() => view.contains("second.py"))
  expect(view.nodes).toHaveLength(2)
  expect(await view.output()).toContain("first.py")
})

test("an older async parse cannot overwrite a finalized call", async () => {
  const view = await setup()
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof ai.parseJson>>>()
  vi.spyOn(ai, "parseJson").mockImplementationOnce(() => pending.promise)
  await view.event(delta('{"path":"stale.py"'))
  await view.event(call())
  pending.resolve({ success: true, data: { path: "stale.py" }, repaired: true })
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(await view.output()).toContain("final.py")
  expect(await view.output()).not.toContain("stale.py")
})

test("newer argument buffers win over older async repairs", async () => {
  const view = await setup()
  const pending = Promise.withResolvers<Awaited<ReturnType<typeof ai.parseJson>>>()
  const parse = ai.parseJson
  vi.spyOn(ai, "parseJson")
    .mockImplementationOnce(() => pending.promise)
    .mockImplementation(parse)
  await view.event(delta('{"path":"stale.py"'))
  await view.event(delta('{"path":"newest.py"}'))
  pending.resolve({ success: true, data: { path: "stale.py" }, repaired: true })
  await until(() => view.contains("newest.py"))
  expect(await view.output()).not.toContain("stale.py")
})

test.each(["flush", "reset"] as const)(
  "%s prevents stale repairs and allows a fresh next step",
  async (method) => {
    const view = await setup()
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof ai.parseJson>>>()
    const parse = ai.parseJson
    vi.spyOn(ai, "parseJson")
      .mockImplementationOnce(() => pending.promise)
      .mockImplementation(parse)
    await view.event(delta('{"path":"stale.py"'))
    view.stream[method]()
    pending.resolve({ success: true, data: { path: "stale.py" }, repaired: true })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(await view.output()).not.toContain("stale.py")
    if (method === "reset") view.stream.attach()
    await view.event(delta('{"path":"next.py"}'))
    await until(() => view.contains("next.py"))
    expect(view.nodes).toHaveLength(2)
  }
)
