/**
 * Tasks demo — shows what the model actually sees on the wire across
 * the long-running-task lifecycle.
 *
 * Each section runs a real interaction against the real `Tasks` registry
 * (with `bashTool`, `task_list`, `task_poll`, `task_stop`) and prints the
 * exact text the model would receive — i.e. tool-result content after
 * `transformMeta` + `stringifyContent`, and system injects after the
 * same flattening.
 *
 * Run from repo root:
 *   bun run packages/agent/demo/tasks.ts
 *
 * No model API is contacted — this is pure harness inspection.
 */

import type { Message, ToolCallPart, ToolContext, ToolResultPart } from "@zaly/ai"
import type { TaskInfo } from "../src/tasks.ts"

import { stringifyContent, transformMeta } from "@zaly/ai"
import { Tasks, taskCompletionMessage, taskInfoPart } from "../src/index.ts"
import { bashTool } from "../src/tools/bash.ts"
import { taskStopTool, taskListTool, taskPollTool } from "../src/tools/tasks.ts"
import { uuidv7 } from "../src/utils/uuid.ts"

// ── tiny output helpers ─────────────────────────────────────────────────

const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const CYAN = "\x1b[36m"
const RESET = "\x1b[0m"

function section(title: string): void {
  const bar = "━".repeat(Math.max(0, 70 - title.length))
  console.log(`\n${BOLD}${CYAN}━━ ${title} ${bar}${RESET}`)
}

function note(msg: string): void {
  console.log(`${DIM}${msg}${RESET}`)
}

function showSystemMessage(msg: Message<"system">, label: string): void {
  console.log(`${DIM}── ${label} ──${RESET}`)
  // Same path the provider adapter takes: meta → text via transformMeta,
  // then join via stringifyContent. What lands on the wire is what the
  // model sees.
  console.log(stringifyContent(transformMeta(msg.content)))
}

function showToolResult(part: ToolResultPart, label = "tool message"): void {
  console.log(`${DIM}── ${label} (id=${part.id}, name=${part.name}) ──${RESET}`)
  console.log(stringifyContent(transformMeta(part.content)))
}

function showHeartbeat(running: readonly TaskInfo[]): void {
  // Mirrors agent.ts heartbeat handler — same MetaPart envelope.
  const msg: Message<"system"> = {
    content: [{ content: [taskInfoPart(running)], tag: "heartbeat", type: "meta" }],
    role: "system",
  }
  showSystemMessage(msg, "heartbeat inject")
}

function call(name: string, params: unknown): ToolCallPart {
  return { id: uuidv7(), name, params, type: "tool-call" }
}

function makeCtx(tasks: Tasks): ToolContext {
  return { cwd: process.cwd(), tasks }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const TOOLS = [bashTool, taskListTool, taskPollTool, taskStopTool]

// ════════════════════════════════════════════════════════════════════════
// 1. Fast bash — completes inside the grace window
// ════════════════════════════════════════════════════════════════════════
{
  section("1. Fast bash — completes in-grace, model gets full result immediately")

  const tasks = new Tasks()
  tasks.tools = TOOLS
  tasks.graceMs = 2000

  const parts = await tasks.run(
    [call("bash", { command: "echo 'hello, world'", description: "greet" })],
    makeCtx(tasks)
  )
  for (const p of parts) showToolResult(p)
  note("\n→ Model sees the <bash> status MetaPart and the stdout in one go.")
}

// ════════════════════════════════════════════════════════════════════════
// 2. Slow bash — exceeds grace, promotes to background task
// ════════════════════════════════════════════════════════════════════════
{
  section("2. Slow bash — promotes past grace; completion lands later as inject")

  const tasks = new Tasks()
  tasks.tools = TOOLS
  tasks.graceMs = 500

  let completion: Message<"system"> | undefined
  tasks.on("task-done", ({ task }) => {
    completion = taskCompletionMessage(task)
  })

  const parts = await tasks.run(
    [
      call("bash", {
        command: "sleep 1; echo 'finally done'",
        description: "slow command",
      }),
    ],
    makeCtx(tasks)
  )
  for (const p of parts) showToolResult(p, "tool message — running placeholder")
  note('\n→ The model sees `status: "running"` and gets back control immediately.')

  await sleep(1500)
  console.log()
  if (completion) showSystemMessage(completion, "task-done inject (1s later)")
  note("\n→ The completion arrives as a separate system message in the next step.")
}

// ════════════════════════════════════════════════════════════════════════
// 3. Bash error — binary output trips BINARY_OUTPUT
// ════════════════════════════════════════════════════════════════════════
{
  section("3. Bash error — surfaces structured <error> tag")

  const tasks = new Tasks()
  tasks.tools = TOOLS
  tasks.graceMs = 2000

  let completion: Message<"system"> | undefined
  tasks.on("task-done", ({ task }) => {
    completion = taskCompletionMessage(task)
  })

  // printf binary bytes: \x00 trips the BINARY_OUTPUT detector in bash.ts
  const parts = await tasks.run(
    [
      call("bash", {
        command: "printf '\\x00\\x01\\x02hello\\x00world'",
        description: "emit binary",
      }),
    ],
    makeCtx(tasks)
  )
  for (const p of parts) showToolResult(p, "tool message — error result")

  // Bash errors complete inside grace, so task-done fires too. (The body
  // and the tool-message content are the same here; the inject is what
  // any longer-running error would look like.)
  await sleep(50)
  if (completion) {
    console.log()
    showSystemMessage(completion, "post-grace error path (same shape, separate inject)")
  }
  note("\n→ Note the structured <error>{code,data?}</error> sibling tag —")
  note("  model can branch on `error.code` while reading the message in the body.")
}

// ════════════════════════════════════════════════════════════════════════
// 4. Parallel chain — second slow bash queued as pending
// ════════════════════════════════════════════════════════════════════════
{
  section("4. Parallel chain — bash defaults to parallel:false")

  const tasks = new Tasks()
  tasks.tools = TOOLS
  tasks.graceMs = 400

  const completions: Message<"system">[] = []
  tasks.on("task-done", ({ task }) => {
    completions.push(taskCompletionMessage(task))
  })

  // Two bash calls in one batch. The first promotes (over grace); the
  // second is parallel:false so it queues behind the first.
  const parts = await tasks.run(
    [
      call("bash", {
        command: "sleep 0.8; echo 'first done'",
        description: "first slow",
      }),
      call("bash", {
        command: "echo 'second runs after first'",
        description: "second sequential",
      }),
    ],
    makeCtx(tasks)
  )
  for (const p of parts) showToolResult(p, "tool message")
  note('\n→ First is `status: "running"`, second is `status: "pending"` waiting on the first.')

  // Wait for both to complete + the chained dispatch to settle
  await sleep(1500)
  for (const c of completions) {
    console.log()
    showSystemMessage(c, `task-done inject`)
  }
  note(`\n→ Both completions arrive as system messages, in order.`)
}

// ════════════════════════════════════════════════════════════════════════
// 5. Heartbeat — periodic pulse while a task is in flight
// ════════════════════════════════════════════════════════════════════════
{
  section("5. Heartbeat — what the model sees during a long-running task")

  const tasks = new Tasks()
  tasks.tools = TOOLS
  tasks.graceMs = 200
  tasks.heartbeatMs = 300

  // Capture the first heartbeat that fires with running tasks present.
  let captured: readonly TaskInfo[] | undefined
  tasks.on("heartbeat", ({ running }) => {
    if (captured === undefined && running.length > 0) captured = running
  })

  // Long bash that drips output — still running when the heartbeat fires.
  const parts = await tasks.run(
    [
      call("bash", {
        command: "for i in 1 2 3 4 5; do echo line $i; sleep 0.3; done",
        description: "tail-ish",
      }),
    ],
    makeCtx(tasks)
  )
  for (const p of parts) showToolResult(p, "tool message — running placeholder")

  // Wait for a heartbeat to land while the task is still in flight
  await sleep(600)
  console.log()
  if (captured) showHeartbeat(captured)
  note("\n→ Each running task gets one JSON line. `hasNewOutput` flips to true")
  note("  when the underlying streamable has bytes the model hasn't seen yet.")

  // Drain so the timer stops cleanly
  await tasks.killAll()
}

// ════════════════════════════════════════════════════════════════════════
// 6. task_list — explicit inventory query
// ════════════════════════════════════════════════════════════════════════
{
  section("6. task_list — what `task_list` returns to the model")

  const tasks = new Tasks()
  tasks.tools = TOOLS
  tasks.graceMs = 200

  // Start one slow task, complete one fast task, leave one pending
  await tasks.run(
    [call("bash", { command: "sleep 1; echo done", description: "background" })],
    makeCtx(tasks)
  )

  // Now ask task_list (inside the same registry)
  const parts = await tasks.run([call("task_list", { includeFinished: true })], makeCtx(tasks))
  for (const p of parts) showToolResult(p, "task_list result")
  note("\n→ Each task on its own JSON line. `result` is stripped on done")
  note("  tasks — listing is an inventory, not a transcript.")

  await tasks.killAll()
}

// ════════════════════════════════════════════════════════════════════════
// 7. task_poll — fetch incremental output mid-flight
// ════════════════════════════════════════════════════════════════════════
{
  section("7. task_poll — incremental output, advances the cursor")

  const tasks = new Tasks()
  tasks.tools = TOOLS
  tasks.graceMs = 200

  // Start a task that prints over time
  const initial = await tasks.run(
    [
      call("bash", {
        command: "for i in 1 2 3 4 5; do echo line $i; sleep 0.15; done",
        description: "drips output",
      }),
    ],
    makeCtx(tasks)
  )
  // Pull the running task's id from the placeholder's meta.task.id
  const taskId = initial[0].meta?.task?.id
  note(`(running task id: ${taskId})`)

  // Wait so some output accumulates, then poll
  await sleep(500)
  console.log()
  const polled = await tasks.run([call("task_poll", { id: taskId })], makeCtx(tasks))
  for (const p of polled) showToolResult(p, "task_poll result (incremental)")
  note("\n→ Returns lines produced since the last poll. Cursor advances —")
  note("  next poll only sees what arrives after this one.")

  // Wait for completion
  await sleep(1000)
}

// ════════════════════════════════════════════════════════════════════════
// 8. Wakeup — schedule + carry-over when something else fires first
// ════════════════════════════════════════════════════════════════════════
{
  section("8. Wakeup — fires on its own OR carries hint over when cancelled")

  // Synthesize what the agent's wakeup paths build, without spinning up
  // an Agent. Same MetaPart shapes used in agent.ts.
  const id = uuidv7()
  const hint = "check git status after install"

  // Case A: wakeup fires on its own
  const fired: Message<"system"> = {
    content: [{ data: { hint, id }, tag: "wakeup", type: "meta" }],
    role: "system",
  }
  showSystemMessage(fired, "wakeup fired (timer expired before anything else)")

  // Case B: wakeup cancelled because task-done woke the loop first
  console.log()
  const cancelled: Message<"system"> = {
    content: [{ data: { hint, id, status: "cancelled" }, tag: "wakeup", type: "meta" }],
    role: "system",
  }
  showSystemMessage(cancelled, "wakeup cancelled (carry-over, sibling to task-done)")
  note("\n→ Same hint, different `status`. The model sees its scheduled intent")
  note("  whether the timer fired or was preempted.")
}

console.log()
