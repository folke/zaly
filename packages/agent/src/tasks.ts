import type {
  Message,
  Tool,
  ToolCallPart,
  ToolContext,
  ToolResult,
  ToolResultPart,
  Streamable as TStreamable,
} from "@zaly/ai"

import {
  formatToolError,
  isStreamable,
  runTool,
  stringifyToolResult,
  ToolError,
} from "@zaly/ai"
import { Emitter } from "./events.ts"
import { uuidv7 } from "./utils/uuid.ts"

const DEFAULT_GRACE_MS = 10_000

/** Status of a task. `pending` = queued behind a dependency, not yet
 *  started. `running` = work in progress (a Streamable is being polled).
 *  `done` = result captured, no longer mutating. */
export type TaskStatus = "pending" | "running" | "done"

/** Public task shape. The Tasks registry exposes these via `running()`
 *  and `finished()`. Tools that introspect the registry (`task_list`,
 *  `task_wait`) read this surface. */
export interface Task {
  id: string
  type: string
  desc: string
  status: TaskStatus
  /** When set, this task is queued behind another and won't start until
   *  the named task transitions to `done`. */
  dependsOn?: string
  /** Wallclock at registration. */
  startedAt: number
  /** Wallclock at completion; set once status is `done`. */
  finishedAt?: number
  /** Final result; set once status is `done`. */
  result?: ToolResult
}

/** Events emitted by a `Tasks` instance. `task-done` only fires for
 *  completions that happen *outside* an in-flight `run()` round —
 *  round-internal completions are folded into the `run()` return value
 *  instead. `heartbeat` fires periodically (when `heartbeatMs` is set
 *  and at least one task is active), giving the agent a hook to keep
 *  the model engaged on long-running work. */
export type TasksEvent =
  | { type: "task-added"; task: Task }
  | { type: "task-removed"; task: Task }
  | { type: "task-done"; task: Task }
  | { type: "heartbeat"; running: readonly Task[] }

/** Augment ToolMeta so tools and consumers can read freshness/state info
 *  off `ToolResultPart.meta.task`. The registry stamps this on every
 *  result it produces so the model can correlate placeholders to their
 *  eventual completion. */
declare module "@zaly/ai" {
  interface ToolMeta {
    task?: {
      id: string
      status: TaskStatus
      type: string
      desc: string
      dependsOn?: string
      durationMs?: number
    }
  }
}

interface InternalTask extends Task {
  /** Streamable returned by the tool, if any — held so we can `abort()`
   *  on cancellation and call `poll()` for partial snapshots. */
  streamable?: TStreamable
  /** Resolves when the task transitions to `done`. Used by the round
   *  race in `run()` and (later) by `task_wait`. */
  donePromise: Promise<void>
  resolveDone: () => void
  /** When set, the task belongs to an in-flight `run()` round — its
   *  completion does *not* fire `task-done` (the round folds it into the
   *  returned parts instead). Cleared once the round ends. */
  ownerRound?: symbol
  /** Stashed call so `runPending` can restart a pending task once its
   *  dependency completes. */
  pending?: { tool: Tool; call: ToolCallPart; ctx: ToolContext }
}

/**
 * Tool registry + execution machinery + long-running task bookkeeping.
 * One Tasks instance per Agent. Owns the tool list (the agent delegates
 * `agent.tools` to it) and runs every assistant tool batch through
 * `run()`, which:
 *
 *  - validates each call's params,
 *  - dispatches to the named tool (sync results land immediately),
 *  - races `Streamable` returns against a grace window,
 *  - chains `parallel: false` calls behind their predecessors,
 *  - returns `ToolResultPart[]` 1:1 with the assistant's calls,
 *    surfacing partial results / placeholders for anything still running
 *    when the grace expires.
 *
 * Completions during a round are folded into the returned parts and do
 * NOT fire `task-done`. Completions afterward fire normally — the agent
 * listens and injects a system message into the next step.
 */
export class Tasks extends Emitter<TasksEvent> {
  readonly #map = new Map<string, InternalTask>()
  #tools: Tool[] = []
  graceMs = DEFAULT_GRACE_MS

  /** Heartbeat interval in ms. When set, fires `heartbeat` events while
   *  at least one task is pending or running. Self-managing: starts on
   *  the first active task, stops when the last one finishes. Set to
   *  `undefined` to disable. */
  #heartbeatMs?: number
  #heartbeatTimer?: ReturnType<typeof setInterval>

  get heartbeatMs(): number | undefined {
    return this.#heartbeatMs
  }
  set heartbeatMs(value: number | undefined) {
    this.#heartbeatMs = value
    this.#syncHeartbeat()
  }

  // ── Tool registry ───────────────────────────────────────────────────

  get tools(): readonly Tool[] {
    return this.#tools
  }
  set tools(next: Tool[]) {
    this.#tools = next
  }

  // ── Public registry surface ─────────────────────────────────────────

  /** Snapshot of every active task (pending or running). */
  running(): readonly Task[] {
    return [...this.#map.values()].filter((t) => t.status !== "done").map(toPublic)
  }

  /** Snapshot of every task that has completed. Drops are by `remove()`
   *  or implicit retention; this list grows unless the caller prunes. */
  finished(): readonly Task[] {
    return [...this.#map.values()].filter((t) => t.status === "done").map(toPublic)
  }

  /** Look up a task by id. Useful for `task_wait` / `task_kill`. */
  get(id: string): Task | undefined {
    const t = this.#map.get(id)
    return t ? toPublic(t) : undefined
  }

  /** Drop a task from the registry — does not abort. Caller is
   *  responsible for `abort()`-ing if the task is still running. */
  remove(id: string): boolean {
    const task = this.#map.get(id)
    if (!task) return false
    this.#map.delete(id)
    this.emit({ task: toPublic(task), type: "task-removed" })
    return true
  }

  /** Mark a task done with a final result. Fires `task-done` UNLESS the
   *  task is currently owned by an in-flight `run()` round — in that
   *  case the round folds the completion into its returned parts and
   *  the event is suppressed. Starts any pending dependents. */
  done(id: string, result: ToolResult): void {
    const task = this.#map.get(id)
    if (!task || task.status === "done") return
    task.status = "done"
    task.result = result
    task.finishedAt = Date.now()
    task.resolveDone()
    if (!task.ownerRound) this.emit({ task: toPublic(task), type: "task-done" })
    this.#startReadyDependents(id, result)
    this.#syncHeartbeat()
  }

  /** Abort a running task. Calls the streamable's `abort()` if present;
   *  pending tasks transition straight to `done` with a cancelled
   *  result. Idempotent. */
  abort(id: string, reason = "aborted by request"): void {
    const task = this.#map.get(id)
    if (!task || task.status === "done") return
    if (task.streamable) task.streamable.abort()
    if (task.status === "pending") {
      this.done(id, formatToolError(new ToolError({ code: "TASK_ABORTED", message: reason })))
    }
    // Running tasks: the streamable will eventually settle and call done()
    // via its watcher. We could force a synchronous "done" here, but
    // letting the streamable's natural completion path run keeps the
    // final snapshot accurate (output that arrived before abort lands).
  }

  /** Abort every active task. Used on agent dispose. Awaits each
   *  task's `donePromise` so the registry is fully drained before
   *  resolving — so callers can rely on no pending I/O after `dispose`. */
  async killAll(): Promise<void> {
    const active = [...this.#map.values()].filter((t) => t.status !== "done")
    for (const t of active) {
      if (t.streamable) t.streamable.abort()
      if (t.status === "pending") {
        this.done(
          t.id,
          formatToolError(new ToolError({ code: "TASK_ABORTED", message: "agent disposed" }))
        )
      }
    }
    await Promise.all(active.map((t) => t.donePromise.catch(() => undefined)))
    this.#syncHeartbeat()
  }

  /** Start or stop the heartbeat timer based on whether any task is
   *  active and whether `heartbeatMs` is configured. Idempotent — called
   *  after every state transition (`add` / `done` / `killAll`). The
   *  timer is `unref`'d so it never holds the process open. */
  #syncHeartbeat(): void {
    const hasActive = [...this.#map.values()].some((t) => t.status !== "done")
    const want = hasActive && this.#heartbeatMs !== undefined
    if (want && !this.#heartbeatTimer) {
      this.#heartbeatTimer = setInterval(() => {
        this.emit({ running: this.running(), type: "heartbeat" })
      }, this.#heartbeatMs)
      this.#heartbeatTimer.unref()
    } else if (!want && this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer)
      this.#heartbeatTimer = undefined
    }
  }

  // ── Batch execution ─────────────────────────────────────────────────

  /**
   * Execute a batch of assistant tool calls. Returns ToolResultPart[]
   * mapped 1:1 with `calls`. Sync completions land in the result array
   * immediately; long-running ones return a placeholder and the eventual
   * completion fires `task-done` post-round (the agent injects a system
   * message in response).
   *
   * The `messages` snapshot is what tools see on `ctx.messages` — pass
   * the conversation up to (and including) the assistant message that
   * produced these calls, so freshness checks can scan back through
   * prior tool results.
   */
  async run(calls: readonly ToolCallPart[], ctxBase: ToolContext): Promise<ToolResultPart[]> {
    const round = Symbol("round")
    const tasks: InternalTask[] = []
    let chainHead: string | undefined

    for (const call of calls) {
      const tool = this.#tools.find((t) => t.name === call.name)
      if (!tool) {
        tasks.push(this.#startSyncResult(call, unknownToolResult(call.name), round))
        continue
      }

      const parallel = tool.parallel ?? false

      if (chainHead && !parallel) {
        // Queue behind the chain head — won't start until that finishes.
        tasks.push(this.#registerPending({ call, ctxBase, dependsOn: chainHead, round, tool }))
        chainHead = tasks[tasks.length - 1].id
        continue
      }

      const task = this.#start({ call, ctxBase, round, tool })
      tasks.push(task)
      // If this call promoted to a long-running task and `parallel: false`,
      // subsequent serial calls chain behind it.
      if (task.status === "running" && !parallel) chainHead = task.id
    }

    // Race: every task done, OR grace expires, OR ctx.signal aborts.
    const allDone = Promise.all(tasks.map((t) => t.donePromise))
    const grace = sleep(this.graceMs)
    const aborted = ctxBase.signal
      ? new Promise<void>((resolve) => {
          if (ctxBase.signal!.aborted) resolve()
          else ctxBase.signal!.addEventListener("abort", () => resolve(), { once: true })
        })
      : new Promise<void>(() => undefined) // never resolves
    await Promise.race([allDone, grace, aborted])

    // Release ownership on still-active tasks BEFORE building the result
    // array, so the post-round listener sees them as free-floating if
    // they happen to settle in the same tick.
    const parts: ToolResultPart[] = []
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]
      const call = calls[i]
      if (task.status !== "done") task.ownerRound = undefined
      parts.push(this.#buildPart(call, task))
    }
    return parts
  }

  // ── Internals ──────────────────────────────────────────────────────

  /** Build a "done" task synchronously from a precomputed result.
   *  Used for unknown-tool errors and validation failures. */
  #startSyncResult(call: ToolCallPart, result: ToolResult, round: symbol): InternalTask {
    // oxlint-disable-next-line sort-keys -- semantic field order
    const task = this.#allocate({ id: uuidv7(), type: call.name, desc: call.name, round })
    task.status = "done"
    task.result = result
    task.finishedAt = task.startedAt
    task.resolveDone()
    return task
  }

  /** Allocate an internal task record, register it, and emit `task-added`. */
  #allocate(opts: {
    id: string
    type: string
    desc: string
    dependsOn?: string
    round: symbol
  }): InternalTask {
    let resolveDone!: () => void
    const donePromise = new Promise<void>((r) => {
      resolveDone = r
    })
    const task: InternalTask = {
      dependsOn: opts.dependsOn,
      desc: opts.desc,
      donePromise,
      id: opts.id,
      ownerRound: opts.round,
      resolveDone,
      startedAt: Date.now(),
      status: "pending",
      type: opts.type,
    }
    this.#map.set(task.id, task)
    this.emit({ task: toPublic(task), type: "task-added" })
    this.#syncHeartbeat()
    return task
  }

  /** Register a pending task (chained behind `dependsOn`). Does not
   *  invoke the tool — that happens once the dependency completes. */
  #registerPending(opts: {
    call: ToolCallPart
    tool: Tool
    ctxBase: ToolContext
    dependsOn: string
    round: symbol
  }): InternalTask {
    // oxlint-disable-next-line sort-keys -- semantic field order
    const task = this.#allocate({
      id: uuidv7(),
      type: opts.tool.name,
      desc: descOfCall(opts.call),
      dependsOn: opts.dependsOn,
      round: opts.round,
    })
    task.pending = { call: opts.call, ctx: opts.ctxBase, tool: opts.tool }
    return task
  }

  /** Start a tool call. Allocates a task record, validates params,
   *  invokes `tool.call`, detects `Streamable`, and wires completion
   *  back to `done()`. Returns the task in its post-launch state
   *  (`done` for sync failures or already-resolved sync calls,
   *  `running` for everything else). */
  #start(opts: {
    call: ToolCallPart
    tool: Tool
    ctxBase: ToolContext
    round: symbol
  }): InternalTask {
    // oxlint-disable-next-line sort-keys -- semantic field order
    const task = this.#allocate({
      id: uuidv7(),
      type: opts.tool.name,
      desc: descOfCall(opts.call),
      round: opts.round,
    })
    this.#dispatch(task, opts.tool, opts.call, opts.ctxBase)
    return task
  }

  /** Validate / call / wire up completion for an existing task record.
   *  Used both for fresh tasks (`#start`) and pending-becoming-ready
   *  (`#startReadyDependents`). The task's id and registry entry are
   *  reused so identifiers stay stable across the pending → running
   *  transition.
   *
   *  Delegates the validate/call/error machinery to `runTool` (in
   *  streaming mode) so there's one source of truth. The task's status
   *  is flipped to `running` synchronously — the round loop reads it
   *  right after `#start` returns to decide chain heads, and we want
   *  that read to see the post-launch state, not the allocation default.
   *  Async resolution either keeps it `running` (streamable returned)
   *  or transitions to `done` (sync result or error). */
  #dispatch(task: InternalTask, tool: Tool, call: ToolCallPart, ctxBase: ToolContext): void {
    const ctx: ToolContext = { ...ctxBase, tasks: this }
    task.status = "running"

    void runTool(tool, call.params, ctx, { streaming: true }).then((settled) => {
      if (isStreamable(settled)) {
        // Long-running — hold the streamable for partial snapshots /
        // abort, wire its completion back through done().
        task.streamable = settled
        settled.done.then(
          () => {
            const snap = settled.poll()
            this.done(task.id, {
              content: snap.content,
              error: snap.error,
              isError: snap.isError,
              meta: snap.meta,
            })
          },
          // `done` shouldn't reject by contract; treat as internal bug.
          (error: unknown) => this.done(task.id, formatToolError(error))
        )
        return
      }
      // Sync path: validation error, sync return, or thrown error —
      // runTool has already formatted everything into a ToolResult.
      this.done(task.id, settled)
    })
  }

  /** Walk pending tasks; start any whose `dependsOn` just completed.
   *  If the dependency failed, propagate cancellation: dependents land
   *  in `done` with an `UPSTREAM_FAILED` result. */
  #startReadyDependents(completedId: string, completedResult: ToolResult): void {
    for (const t of this.#map.values()) {
      if (t.status !== "pending" || t.dependsOn !== completedId) continue
      if (completedResult.isError) {
        // Skip dependent — its predecessor failed.
        this.done(
          t.id,
          formatToolError(
            new ToolError({
              code: "UPSTREAM_FAILED",
              data: { dependsOn: completedId },
              message: `skipped: upstream task ${completedId} failed`,
            })
          )
        )
        continue
      }
      // Restart as a regular task. The round that originally registered
      // this task has already returned its placeholder, so whatever
      // happens now flows through normal `task-done`.
      const pending = t.pending
      if (!pending) continue
      t.pending = undefined
      t.dependsOn = undefined
      t.ownerRound = undefined // round has ended; future done() fires the event
      this.#dispatch(t, pending.tool, pending.call, pending.ctx)
    }
  }

  /** Build a `ToolResultPart` for a task at round-end. Done tasks pass
   *  through their captured result; still-running tasks get a snapshot
   *  from the streamable (if any) plus a placeholder note for the model. */
  #buildPart(call: ToolCallPart, task: InternalTask): ToolResultPart {
    if (task.status === "done" && task.result) {
      return {
        content: task.result.content,
        error: task.result.error,
        id: call.id,
        isError: task.result.isError,
        meta: stampTaskMeta(task.result.meta, task),
        name: call.name,
        type: "tool-result",
      }
    }

    // Pending: never started, will run when dependency completes.
    if (task.status === "pending") {
      return {
        content: [
          {
            data: `queued — will run after ${task.dependsOn} completes; result will arrive as a system message`,
            tag: "task",
            type: "meta",
          },
        ],
        id: call.id,
        isError: false,
        meta: stampTaskMeta(undefined, task),
        name: call.name,
        type: "tool-result",
      }
    }

    // Running: capture whatever the streamable has so far (partial output).
    const snap = task.streamable?.poll()
    const partialContent: ToolResultPart["content"] = partialContentFrom(snap)
    return {
      content: partialContent,
      id: call.id,
      isError: false,
      meta: stampTaskMeta(snap?.meta, task),
      name: call.name,
      type: "tool-result",
    }
  }
}

/** Stamp `meta.task` with the current task state. Preserves any
 *  tool-attached `meta` fields. Used both on done results (so the
 *  model can correlate completion to the original call) and on
 *  partial / pending placeholders. */
function stampTaskMeta(
  base: ToolResult["meta"] | undefined,
  task: InternalTask
): ToolResult["meta"] {
  return {
    ...base,
    task: {
      dependsOn: task.dependsOn,
      desc: task.desc,
      durationMs: task.finishedAt ? task.finishedAt - task.startedAt : undefined,
      id: task.id,
      status: task.status,
      type: task.type,
    },
  }
}

/** Build the "running" placeholder content from a streamable snapshot.
 *  Empty string when there's nothing yet to show; copies the parts
 *  array so downstream mutation of the result message can't reach back
 *  into the streamable's accumulator. */
function partialContentFrom(
  snap: { content: ToolResult["content"] } | undefined
): ToolResultPart["content"] {
  if (!snap) return ""
  if (typeof snap.content === "string") return snap.content
  return [...snap.content]
}

/** Strip internal fields from a task record so the public surface stays
 *  immutable from the consumer's POV. */
function toPublic(t: InternalTask): Task {
  return {
    dependsOn: t.dependsOn,
    desc: t.desc,
    finishedAt: t.finishedAt,
    id: t.id,
    result: t.result,
    startedAt: t.startedAt,
    status: t.status,
    type: t.type,
  }
}

/** Best-effort human-readable label for a tool call. Reads a
 *  `description` field from params if the tool defined one (bash does);
 *  otherwise falls back to the tool name. Kept short so log lines stay
 *  scannable. */
function descOfCall(call: ToolCallPart): string {
  const params = call.params as { description?: unknown } | null | undefined
  if (params && typeof params === "object" && typeof params.description === "string") {
    return params.description
  }
  return call.name
}

/** Synthesize the tool-result payload returned when the model calls a
 *  tool that wasn't registered for this turn. Same shape the previous
 *  `unknownToolResult` helper produced; inlined here to keep `tasks.ts`
 *  self-contained. */
function unknownToolResult(name: string): ToolResult {
  const err = new ToolError({
    code: "UNKNOWN_TOOL",
    message: `no tool named "${name}" is registered for this turn`,
  })
  return formatToolError(err)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms)
    t.unref()
  })
}

/** Format a `task-done` event as a system message body for `Agent.inject`.
 *  Centralised so the framing is consistent (XML-tagged, parseable for
 *  TUI rendering) and so changes to the format hit one place. The body
 *  routes through `stringifyToolResult` so meta parts and attachments
 *  collapse the same way they would on the wire. */
export function formatTaskCompletion(task: Task): string {
  const head = `<task id="${task.id}" type="${escapeXml(task.type)}" desc="${escapeXml(task.desc)}">`
  const body = task.result ? stringifyToolResult(task.result.content) : ""
  return `${head}\n${body}\n</task>`
}

/** Build an `inject`-ready system message for a finished task. */
export function taskCompletionMessage(task: Task): Message<"system"> {
  return { content: formatTaskCompletion(task), role: "system" }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
