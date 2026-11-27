import type { Agent, AgentContextEvents, AgentEvents, TaskInfo, TasksEvents } from "@zaly/agent"
import type { AppState } from "../src/types.ts"

import { Emitter } from "@zaly/shared"
import { stripAnsi } from "@zaly/shared/ansi"
import { createCtx, createStore } from "@zaly/tui"
import { expect, test } from "vitest"
import { attachState } from "../src/app/agent.ts"
import { statusline } from "../src/widgets/statusline.ts"

const task = {
  desc: "build",
  elapsedMs: 1,
  id: "task-1",
  status: "running",
  type: "bash",
} satisfies TaskInfo

async function setup() {
  let running: readonly TaskInfo[] = [task]
  const tasks = Object.assign(new Emitter<TasksEvents>(), { running: () => running })
  const agent = Object.assign(new Emitter<AgentEvents>(), {
    ctx: new Emitter<AgentContextEvents>(),
    tasks,
  })
  const state = createStore<AppState>({
    busy: false,
    cwd: process.cwd(),
    loading: false,
    scroll: { below: 0, offset: 0, total: 0 },
    status: "ready",
    step: 0,
  })
  attachState(agent as unknown as Agent, state)
  const line = statusline(state)
  const ctx = await createCtx({ width: 120 })
  return {
    agent,
    output: async () => {
      const rows = await line.render(ctx)
      return stripAnsi(rows.join("\n"))
    },
    setRunning: (value: readonly TaskInfo[]) => (running = value),
    state,
    tasks,
  }
}

test("ready shows the task count alone; paused keeps its label without becoming busy", async () => {
  const { agent, output, setRunning, state, tasks } = await setup()
  expect(await output()).toContain("zaly · 1 task ·")
  await agent.emit("status", { status: "paused" })
  expect(await output()).toContain("paused · 1 task")
  expect(state.status).toBe("paused")
  expect(state.busy).toBe(false)

  setRunning([])
  const done = {
    desc: task.desc,
    durationMs: 1,
    id: task.id,
    result: { content: "ok", isError: false },
    status: "done",
    type: task.type,
  } as const
  await tasks.emit("task-done", { task: done })
  expect(await output()).toMatch(/· paused ·/)
  expect(await output()).not.toContain("task")
})

test("task count stays separate from streaming status and clears at the end of a tool round", async () => {
  const { agent, output, setRunning, tasks } = await setup()
  const pending = { ...task, id: "task-2", status: "pending", waitingFor: task.id } as const
  setRunning([task, pending])
  await tasks.emit("task-added", { task: pending })
  await agent.emit("status", { status: "streaming" })
  expect(await output()).toContain("streaming · 2 tasks")

  setRunning([task])
  await tasks.emit("task-removed", { task: pending })
  expect(await output()).toContain("streaming · 1 task")

  setRunning([])
  await agent.emit("step-end", { outcome: "tool-calls", step: 1 })
  expect(await output()).toContain("streaming")
  expect(await output()).not.toContain("task")
})
