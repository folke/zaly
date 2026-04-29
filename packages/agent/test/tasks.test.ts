import type { Streamable, Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Envelope } from "@zaly/shared"
import type { DoneTaskInfo, TasksEvents } from "../src/tasks.ts"

import { defineTool, ToolError } from "@zaly/ai"
import { Type } from "typebox"
import { afterEach, describe, expect, test } from "vitest"
import { taskCompletionMessage, taskInfoPart, Tasks } from "../src/tasks.ts"

// ── Test helpers ─────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// Tight grace window — every test that exercises grace expiry uses this.
// Real timers throughout (Bun's test runner doesn't speak vitest fake-timer
// APIs, and the actual code paths we want to test are timing-driven).
const GRACE = 20

let counter = 0
const callOf = (name: string, params: unknown = {}): ToolCallPart => ({
  id: `call-${++counter}`,
  name,
  params,
  type: "tool-call",
})

/** Sync tool: returns its own params.value as content. */
const syncTool = defineTool({
  name: "sync",
  parallel: true,
  params: Type.Object({ value: Type.String() }),
  call: ({ value }) => value,
})

/** Sync tool that always throws a ToolError. */
const failTool = defineTool({
  name: "fail",
  parallel: true,
  params: Type.Object({}),
  call: () => {
    throw new ToolError({ code: "BANG", message: "boom" })
  },
})

interface StreamableHandle {
  streamable: Streamable
  finish: (result?: Partial<ToolResult>) => void
  setHasNew: (v: boolean) => void
  setPartial: (content: ToolResult["content"]) => void
  readonly aborted: boolean
}

/** Build a controllable Streamable. */
function makeStreamable(): StreamableHandle {
  let resolveDone!: () => void
  const done = new Promise<void>((r) => {
    resolveDone = r
  })
  const state = {
    aborted: false,
    content: "" as ToolResult["content"],
    hasNew: false,
    isError: false,
    running: true,
  }
  const streamable: Streamable = {
    abort: () => {
      state.aborted = true
    },
    done,
    hasNew: () => state.hasNew,
    poll: () => ({ content: state.content, isError: state.isError, running: state.running }),
  }
  return {
    streamable,
    finish: (r) => {
      if (r?.content !== undefined) state.content = r.content
      if (r?.isError !== undefined) state.isError = r.isError
      state.running = false
      resolveDone()
    },
    setHasNew: (v) => {
      state.hasNew = v
    },
    setPartial: (c) => {
      state.content = c
    },
    get aborted() {
      return state.aborted
    },
  }
}

/** Tool whose call returns a caller-supplied Streamable. */
function streamableTool(opts: {
  name?: string
  parallel?: boolean
  produce: () => Streamable
}): Tool {
  return defineTool({
    name: opts.name ?? "stream",
    parallel: opts.parallel,
    params: Type.Object({}),
    call: () => opts.produce() as never,
  })
}

/** Drive the microtask queue a few times so promise chains in `#dispatch`
 *  settle. Used after streamable resolution so subsequent assertions see
 *  registry state up to date. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

afterEach(() => {
  counter = 0
})

// ── Sync paths ──────────────────────────────────────────────────────────

describe("Tasks.run — sync tool", () => {
  test("returns a result part 1:1 with the assistant call", async () => {
    const tasks = new Tasks()
    tasks.tools = [syncTool]
    const parts = await tasks.run([callOf("sync", { value: "hello" })], {})
    expect(parts).toHaveLength(1)
    expect(parts[0].id).toMatch(/^call-/)
    expect(parts[0].name).toBe("sync")
    expect(parts[0].isError).toBe(false)
    expect(parts[0].content).toBe("hello")
  })

  test("unknown tool name returns UNKNOWN_TOOL error part", async () => {
    const tasks = new Tasks()
    const parts = await tasks.run([callOf("does-not-exist")], {})
    expect(parts[0].isError).toBe(true)
    expect(parts[0].error?.code).toBe("UNKNOWN_TOOL")
  })

  test("validation failure surfaces as INVALID_INPUT error", async () => {
    const tasks = new Tasks()
    tasks.tools = [syncTool]
    const parts = await tasks.run([callOf("sync", {})], {})
    expect(parts[0].isError).toBe(true)
    expect(parts[0].error?.code).toBe("INVALID_INPUT")
  })

  test("thrown ToolError is captured into the result", async () => {
    const tasks = new Tasks()
    tasks.tools = [failTool]
    const parts = await tasks.run([callOf("fail")], {})
    expect(parts[0].isError).toBe(true)
    expect(parts[0].error?.code).toBe("BANG")
  })

  test("each part stamps meta.task.{id,status,type}", async () => {
    const tasks = new Tasks()
    tasks.tools = [syncTool]
    const parts = await tasks.run([callOf("sync", { value: "x" })], {})
    expect(parts[0].meta?.task?.status).toBe("done")
    expect(parts[0].meta?.task?.type).toBe("sync")
    expect(typeof parts[0].meta?.task?.id).toBe("string")
  })
})

// ── Streamable / grace-window paths ─────────────────────────────────────

describe("Tasks.run — streamable within grace", () => {
  test("streamable that completes inside the window folds into the part", async () => {
    const tasks = new Tasks()
    tasks.graceMs = 5000
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]

    const events: Envelope<TasksEvents>[] = []
    tasks.all((event) => events.push(event))

    const runP = tasks.run([callOf("stream")], {})
    await flush()
    ctrl.finish({ content: "all done" })
    const parts = await runP

    expect(parts[0].content).toBe("all done")
    expect(parts[0].isError).toBe(false)
    // Round-internal completions DO NOT fire `task-done`.
    expect(events.some((e) => e.type === "task-done")).toBe(false)
  })
})

describe("Tasks.run — streamable exceeds grace", () => {
  test("returns a running placeholder; task-done fires after grace", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]

    const events: Envelope<TasksEvents>[] = []
    tasks.all((event) => events.push(event))

    const parts = await tasks.run([callOf("stream")], {})

    expect(parts[0].isError).toBe(false)
    expect(parts[0].meta?.task?.status).toBe("running")
    expect(events.some((e) => e.type === "task-done")).toBe(false)

    // Now resolve the streamable; task-done fires post-round.
    ctrl.finish({ content: "late" })
    await flush()
    const done = events.find((e) => e.type === "task-done")
    if (done?.type !== "task-done") throw new Error("expected task-done event")
    expect(done.task.result.content).toBe("late")
  })

  test("running placeholder includes partial content from poll()", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const ctrl = makeStreamable()
    ctrl.setPartial("partial-output")
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]

    const parts = await tasks.run([callOf("stream")], {})
    // Running placeholders are now structured: [partial text, <task> trailer].
    if (typeof parts[0].content === "string") throw new Error("expected parts")
    const text = parts[0].content.find((p) => p.type === "text")
    if (!text) throw new Error("expected text part")
    expect(text.text).toBe("partial-output")
    const trailer = parts[0].content.find((p) => p.type === "meta" && p.tag === "task")
    expect(trailer).toBeDefined()
    ctrl.finish()
    await flush()
  })
})

// ── Chaining (parallel: false) ──────────────────────────────────────────

describe("Tasks.run — chain", () => {
  test("two non-parallel calls: second waits for first", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const a = makeStreamable()
    const b = makeStreamable()
    tasks.tools = [
      streamableTool({ name: "first", parallel: false, produce: () => a.streamable }),
      streamableTool({ name: "second", parallel: false, produce: () => b.streamable }),
    ]

    const parts = await tasks.run([callOf("first"), callOf("second")], {})

    expect(parts[0].meta?.task?.status).toBe("running")
    expect(parts[1].meta?.task?.status).toBe("pending")
    expect(parts[1].meta?.task?.dependsOn).toBe(parts[0].meta?.task?.id)

    a.finish({ content: "a" })
    b.finish({ content: "b" })
    await flush()
  })

  test("dependent starts running once predecessor completes", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const a = makeStreamable()
    const b = makeStreamable()
    tasks.tools = [
      streamableTool({ name: "first", parallel: false, produce: () => a.streamable }),
      streamableTool({ name: "second", parallel: false, produce: () => b.streamable }),
    ]

    const events: Envelope<TasksEvents>[] = []
    tasks.all((event) => events.push(event))

    await tasks.run([callOf("first"), callOf("second")], {})
    a.finish({ content: "ok" })
    await flush()

    const second = tasks.info().find((t) => t.type === "second")
    expect(second?.status).toBe("running")
    b.finish({ content: "ok-b" })
    await flush()
    // Both completions fire post-round.
    expect(events.filter((e) => e.type === "task-done")).toHaveLength(2)
  })

  test("dependent gets UPSTREAM_FAILED when predecessor errors", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const b = makeStreamable()
    // Force fail to be serial so the second call chains behind it.
    const serialFail: Tool = { ...failTool, parallel: false }
    tasks.tools = [
      serialFail,
      streamableTool({ name: "after", parallel: false, produce: () => b.streamable }),
    ]

    await tasks.run([callOf("fail"), callOf("after")], {})
    await flush()

    const after = tasks.finished().find((t) => t.type === "after")
    expect(after?.result.isError).toBe(true)
    expect(after?.result.error?.code).toBe("UPSTREAM_FAILED")
  })

  test("parallel:true tool does NOT establish a chain head", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const a = makeStreamable()
    const b = makeStreamable()
    tasks.tools = [
      streamableTool({ name: "para", parallel: true, produce: () => a.streamable }),
      streamableTool({ name: "para2", parallel: true, produce: () => b.streamable }),
    ]
    const parts = await tasks.run([callOf("para"), callOf("para2")], {})
    expect(parts[0].meta?.task?.status).toBe("running")
    expect(parts[1].meta?.task?.status).toBe("running")
    expect(parts[1].meta?.task?.dependsOn).toBeUndefined()
    a.finish()
    b.finish()
    await flush()
  })
})

// ── Abort / signal ──────────────────────────────────────────────────────

describe("Tasks.run — ctx.signal abort", () => {
  test("signal aborted mid-flight short-circuits the wait", async () => {
    const tasks = new Tasks()
    tasks.graceMs = 60_000
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]

    const ac = new AbortController()
    setTimeout(() => ac.abort(), 5)
    const parts = await tasks.run([callOf("stream")], { signal: ac.signal })
    expect(parts[0].meta?.task?.status).toBe("running")
    ctrl.finish()
  })

  test("pre-aborted signal resolves immediately", async () => {
    const tasks = new Tasks()
    tasks.graceMs = 60_000
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]

    const ac = new AbortController()
    ac.abort()
    const parts = await tasks.run([callOf("stream")], { signal: ac.signal })
    expect(parts).toHaveLength(1)
    ctrl.finish()
  })
})

// ── Public registry surface ─────────────────────────────────────────────

describe("Tasks — public registry", () => {
  test("running() / finished() / info() / get() reflect lifecycle", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]
    await tasks.run([callOf("stream")], {})

    expect(tasks.running()).toHaveLength(1)
    expect(tasks.finished()).toHaveLength(0)
    expect(tasks.info()).toHaveLength(1)

    const id = tasks.running()[0].id
    expect(tasks.get(id)?.id).toBe(id)
    expect(tasks.get("nope")).toBeUndefined()

    ctrl.finish({ content: "ok" })
    await flush()
    expect(tasks.running()).toHaveLength(0)
    expect(tasks.finished()).toHaveLength(1)
  })

  test("remove() drops a known task and emits task-removed", async () => {
    const tasks = new Tasks()
    tasks.tools = [syncTool]
    await tasks.run([callOf("sync", { value: "x" })], {})
    const id = tasks.finished()[0].id

    const events: Envelope<TasksEvents>[] = []
    tasks.all((event) => events.push(event))
    expect(tasks.remove(id)).toBe(true)
    expect(tasks.remove(id)).toBe(false)
    expect(events.some((e) => e.type === "task-removed")).toBe(true)
  })
})

describe("Tasks.pollOutput / hasNewOutput", () => {
  test("pollOutput unknown id → NOT_FOUND", () => {
    const tasks = new Tasks()
    expect(() => tasks.pollOutput("missing")).toThrow(/no task with id/)
  })

  test("pollOutput on a done task → TASK_DONE", async () => {
    const tasks = new Tasks()
    tasks.tools = [syncTool]
    await tasks.run([callOf("sync", { value: "x" })], {})
    const id = tasks.finished()[0].id
    expect(() => tasks.pollOutput(id)).toThrow(/already completed/)
  })

  test("pollOutput on a non-streamable running task → NOT_STREAMABLE", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const neverDone = defineTool({
      name: "slow-sync",
      parallel: true,
      params: Type.Object({}),
      call: () => new Promise<string>(() => undefined),
    })
    tasks.tools = [neverDone]
    await tasks.run([callOf("slow-sync")], {})
    const t = tasks.running()[0]
    expect(() => tasks.pollOutput(t.id)).toThrow(/no incremental output/)
  })

  test("pollOutput returns the streamable's current snapshot", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const ctrl = makeStreamable()
    ctrl.setPartial("partial")
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]
    await tasks.run([callOf("stream")], {})
    const id = tasks.running()[0].id
    const snap = tasks.pollOutput(id)
    expect(snap.content).toBe("partial")
    expect(snap.running).toBe(true)
    ctrl.finish()
    await flush()
  })

  test("hasNewOutput: false for unknown / done / no-streamable; reflects hasNew()", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]
    await tasks.run([callOf("stream")], {})
    const id = tasks.running()[0].id

    expect(tasks.hasNewOutput("nope")).toBe(false)
    expect(tasks.hasNewOutput(id)).toBe(false)
    ctrl.setHasNew(true)
    expect(tasks.hasNewOutput(id)).toBe(true)
    ctrl.finish()
    await flush()
    expect(tasks.hasNewOutput(id)).toBe(false)
  })
})

// ── Abort / killAll ─────────────────────────────────────────────────────

describe("Tasks.abort / killAll", () => {
  test("abort() on a running task forwards to streamable.abort()", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]
    await tasks.run([callOf("stream")], {})

    const id = tasks.running()[0].id
    tasks.abort(id)
    expect(ctrl.aborted).toBe(true)
    ctrl.finish()
    await flush()
  })

  test("abort() on an unknown id is a silent no-op", () => {
    const tasks = new Tasks()
    expect(() => tasks.abort("nope")).not.toThrow()
  })

  test("abort() on a pending task transitions it to done with TASK_ABORTED", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const a = makeStreamable()
    const b = makeStreamable()
    tasks.tools = [
      streamableTool({ name: "first", parallel: false, produce: () => a.streamable }),
      streamableTool({ name: "second", parallel: false, produce: () => b.streamable }),
    ]
    await tasks.run([callOf("first"), callOf("second")], {})
    const pending = tasks.running().find((t) => t.status === "pending")
    if (!pending) throw new Error("expected pending task")
    tasks.abort(pending.id, "user request")
    const finished = tasks.finished().find((t) => t.id === pending.id)
    expect(finished?.result.error?.code).toBe("TASK_ABORTED")
    a.finish()
    await flush()
  })

  test("killAll drains active tasks (after streamables settle)", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const a = makeStreamable()
    const b = makeStreamable()
    // Both serial so y queues as pending behind running x — exercises both
    // killAll branches: streamable.abort() for running, done(TASK_ABORTED)
    // for pending.
    tasks.tools = [
      streamableTool({ name: "x", parallel: false, produce: () => a.streamable }),
      streamableTool({ name: "y", parallel: false, produce: () => b.streamable }),
    ]
    await tasks.run([callOf("x"), callOf("y")], {})
    const killP = tasks.killAll()
    a.finish() // resolve x's streamable so its donePromise can settle
    await killP
    expect(tasks.running()).toHaveLength(0)
  })
})

// ── done() direct ───────────────────────────────────────────────────────

describe("Tasks.done direct", () => {
  test("idempotent — calling done() twice is a no-op", async () => {
    const tasks = new Tasks()
    tasks.tools = [syncTool]
    await tasks.run([callOf("sync", { value: "x" })], {})
    const id = tasks.finished()[0].id
    expect(() => tasks.done(id, { content: "y", isError: false })).not.toThrow()
  })

  test("fires task-done when the task is no longer round-owned", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]

    const events: Envelope<TasksEvents>[] = []
    tasks.all((event) => events.push(event))

    await tasks.run([callOf("stream")], {})
    // After the round, ownership is released. Settling now fires task-done.
    ctrl.finish({ content: "free" })
    // The streamable.done.then() chain → tasks.done() → emit happens across
    // multiple microtasks; flush a few rounds to settle.
    await flush()
    await flush()
    expect(events.some((e) => e.type === "task-done")).toBe(true)
  })
})

// ── Heartbeat ───────────────────────────────────────────────────────────

describe("Tasks.heartbeatMs", () => {
  test("emits heartbeat events while a task is active; stops when none remain", async () => {
    const tasks = new Tasks()
    tasks.graceMs = GRACE
    tasks.heartbeatMs = 25
    const ctrl = makeStreamable()
    tasks.tools = [streamableTool({ produce: () => ctrl.streamable })]

    const events: Envelope<TasksEvents>[] = []
    tasks.all((event) => events.push(event))

    await tasks.run([callOf("stream")], {})
    await sleep(80)
    const beats = events.filter((e) => e.type === "heartbeat")
    expect(beats.length).toBeGreaterThanOrEqual(1)

    ctrl.finish({ content: "done" })
    await flush()
    const beforeFinal = events.length
    await sleep(80)
    expect(events.length).toBe(beforeFinal)
  })

  test("setting heartbeatMs to undefined clears the timer", () => {
    const tasks = new Tasks()
    tasks.heartbeatMs = 100
    tasks.heartbeatMs = undefined
    expect(tasks.heartbeatMs).toBeUndefined()
  })
})

// ── Pure helpers ────────────────────────────────────────────────────────

describe("taskInfoPart", () => {
  test("empty list → 'no active tasks'", () => {
    expect(taskInfoPart([])).toEqual({ data: "no active tasks", tag: "tasks", type: "meta" })
  })

  test("strips `result` from done entries", () => {
    const done: DoneTaskInfo = {
      desc: "x",
      durationMs: 10,
      id: "t1",
      result: { content: "secret-output", isError: false },
      status: "done",
      type: "sync",
    }
    const part = taskInfoPart([done])
    expect(typeof part.data).toBe("string")
    expect(part.data as string).not.toContain("secret-output")
    expect(part.data as string).toContain("t1")
  })
})

describe("taskCompletionMessage", () => {
  test("renders a system message with header MetaPart + body text", () => {
    const done: DoneTaskInfo = {
      desc: "demo",
      durationMs: 12,
      id: "t-2",
      result: { content: "the body", isError: false },
      status: "done",
      type: "sync",
    }
    const msg = taskCompletionMessage(done)
    expect(msg.role).toBe("system")
    if (typeof msg.content === "string") throw new Error("expected parts")
    const text = msg.content.find((p) => p.type === "text")
    expect(text?.type === "text" ? text.text : "").toBe("the body")
  })

  test("omits the body part when result content is empty", () => {
    const done: DoneTaskInfo = {
      desc: "empty",
      durationMs: 1,
      id: "t-3",
      result: { content: "", isError: false },
      status: "done",
      type: "sync",
    }
    const msg = taskCompletionMessage(done)
    if (typeof msg.content === "string") throw new Error("expected parts")
    expect(msg.content.filter((p) => p.type === "text")).toHaveLength(0)
  })
})

describe("descOfCall (via task desc)", () => {
  test("uses params.description when present", async () => {
    const tasks = new Tasks()
    tasks.tools = [
      defineTool({
        name: "withdesc",
        parallel: true,
        params: Type.Object({ description: Type.String() }),
        call: ({ description }) => description,
      }),
    ]
    await tasks.run([callOf("withdesc", { description: "do the thing" })], {})
    expect(tasks.finished()[0].desc).toBe("do the thing")
  })

  test("falls back to the tool name when no description param is set", async () => {
    const tasks = new Tasks()
    tasks.tools = [syncTool]
    await tasks.run([callOf("sync", { value: "x" })], {})
    expect(tasks.finished()[0].desc).toBe("sync")
  })
})
