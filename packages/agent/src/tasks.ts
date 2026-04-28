import type {
  ContentPart,
  Message,
  MetaPart,
  TextPart,
  Tool,
  ToolCallPart,
  ToolContext,
  ToolResult,
  ToolResultPart,
  Streamable as TStreamable,
} from "@zaly/ai"

import { formatToolError, isStreamable, runTool, stringifyContent, ToolError } from "@zaly/ai"
import { Emitter } from "./events.ts"
import { uuidv7 } from "./utils/uuid.ts"

const DEFAULT_GRACE_MS = 10_000

/** Status of a task. `pending` = queued behind a dependency, not yet
 *  started. `running` = work in progress (a Streamable is being polled).
 *  `done` = result captured, no longer mutating. */
export type TaskStatus = "pending" | "running" | "done"

/** Public projection of a registered task. Status-discriminated so the
 *  fields visible at any moment are exactly the ones that make sense
 *  for that lifecycle stage:
 *
 *    - `running`: `elapsedMs` since start; `hasNewOutput` when the
 *      streamable signals that `task_poll` would yield bytes.
 *    - `pending`: queued behind another task (`waitingFor`); `elapsedMs`
 *      counts time-since-registration.
 *    - `done`: settled. Carries `durationMs` and the captured `result`.
 *
 *  This is the only public task type — the registry exposes it via
 *  `running()` / `finished()` / `get()`, events carry it (`task-done`
 *  is narrowed to `status: "done"` so listeners get `result` typed
 *  without checks), and `task_list` JSON-stringifies it directly. */
export type TaskInfo = {
  id: string
  type: string
  desc: string
} & (
  | { status: "running"; elapsedMs: number; hasNewOutput?: boolean }
  | { status: "pending"; waitingFor: string; elapsedMs: number }
  | { status: "done"; durationMs: number; result: ToolResult }
)

/** A `TaskInfo` known to be in the `done` state. `task-done` event
 *  payloads use this so listeners get `result` and `durationMs` typed
 *  without manual narrowing. */
export type DoneTaskInfo = Extract<TaskInfo, { status: "done" }>

/** Events emitted by a `Tasks` instance. `task-done` only fires for
 *  completions that happen *outside* an in-flight `run()` round —
 *  round-internal completions are folded into the `run()` return value
 *  instead. `heartbeat` fires periodically (when `heartbeatMs` is set
 *  and at least one task is active), giving the agent a hook to keep
 *  the model engaged on long-running work. */
export type TasksEvent =
  | { type: "task-added"; task: TaskInfo }
  | { type: "task-removed"; task: TaskInfo }
  | { type: "task-done"; task: DoneTaskInfo }
  | { type: "heartbeat"; running: readonly TaskInfo[] }

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

/** Internal storage record. Not exposed — `toTaskInfo` projects it to
 *  `TaskInfo` for any caller that crosses the boundary (events,
 *  registry methods, the `task_*` tools). Carries everything the
 *  registry needs to drive lifecycle transitions, plus the raw
 *  timestamps `TaskInfo` derives elapsed/duration from. */
interface InternalTask {
  id: string
  type: string
  desc: string
  status: TaskStatus
  /** Wallclock at registration. */
  startedAt: number
  /** Wallclock at completion; set once status is `done`. */
  finishedAt?: number
  /** Captured result when status is `done`. */
  result?: ToolResult
  /** When set, this task is queued behind another and won't start until
   *  the named task transitions to `done`. */
  waitingFor?: string
  /** Streamable returned by the tool, if any — held so we can `abort()`
   *  on cancellation and call `poll()` for partial snapshots. */
  streamable?: TStreamable
  /** Resolves when the task transitions to `done`. Used by the round
   *  race in `run()`. */
  donePromise: Promise<void>
  resolveDone: () => void
  /** When set, the task belongs to an in-flight `run()` round — its
   *  completion does *not* fire `task-done` (the round folds it into the
   *  returned parts instead). Cleared once the round ends. */
  ownerRound?: symbol
  /** Stashed call so a pending task can be restarted once its
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
  running(): readonly TaskInfo[] {
    return [...this.#map.values()]
      .filter((t) => t.status !== "done")
      .map((t) => toTaskInfo(t))
  }

  /** Snapshot of every task that has completed. Drops are by `remove()`
   *  or implicit retention; this list grows unless the caller prunes. */
  finished(): readonly DoneTaskInfo[] {
    return [...this.#map.values()]
      .filter((t): t is InternalTask & { status: "done" } => t.status === "done")
      .map((t) => toTaskInfo(t) as DoneTaskInfo)
  }

  /** Look up a task by id. Useful for `task_stop` / `task_poll`. */
  get(id: string): TaskInfo | undefined {
    const t = this.#map.get(id)
    return t ? toTaskInfo(t) : undefined
  }

  /** Snapshot of every task in the registry — running, pending, and done. */
  info(): readonly TaskInfo[] {
    return [...this.#map.values()].map(toTaskInfo)
  }

  /** Non-consuming check: does the underlying streamable have output
   *  the model hasn't seen since the last `poll()`? Returns false for
   *  tasks without a streamable, completed tasks, or streamables that
   *  don't implement the optional `hasNew` hook (no signal to give).
   *  Used by heartbeats to flag tasks worth polling. */
  hasNewOutput(id: string): boolean {
    const t = this.#map.get(id)
    if (t?.status !== "running" || !t.streamable) return false
    return t.streamable.hasNew?.() ?? false
  }

  /** Poll a task's streamable for incremental output without changing
   *  its lifecycle state. Advances the streamable's cursor — the next
   *  call returns only what arrived since *this* one. Returns the same
   *  `ToolResult` shape the original tool produces (parts + meta).
   *  Errors when the task is unknown, already done, or has no streamable
   *  (the latter is the case for plain-Promise tools — there's no
   *  partial state to read). */
  pollOutput(id: string): ToolResult & { running: boolean } {
    const t = this.#map.get(id)
    if (!t) {
      throw new ToolError({
        code: "NOT_FOUND",
        data: { id },
        message: `no task with id "${id}"`,
      })
    }
    if (t.status === "done") {
      throw new ToolError({
        code: "TASK_DONE",
        data: { id },
        message: `task "${id}" has already completed; its result was injected as a system message`,
      })
    }
    if (!t.streamable) {
      throw new ToolError({
        code: "NOT_STREAMABLE",
        data: { id },
        message:
          `task "${id}" has no incremental output — it's a plain-Promise tool ` +
          `whose result is delivered all-at-once when complete`,
      })
    }
    return t.streamable.poll()
  }

  /** Drop a task from the registry — does not abort. Caller is
   *  responsible for `abort()`-ing if the task is still running. */
  remove(id: string): boolean {
    const task = this.#map.get(id)
    if (!task) return false
    this.#map.delete(id)
    this.emit({ task: toTaskInfo(task), type: "task-removed" })
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
    if (!task.ownerRound) {
      this.emit({ task: toTaskInfo(task) as DoneTaskInfo, type: "task-done" })
    }
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
        this.emit({ running: this.info().filter((t) => t.status !== "done"), type: "heartbeat" })
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
        tasks.push(this.#registerPending({ call, ctxBase, round, tool, waitingFor: chainHead }))
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
    waitingFor?: string
    round: symbol
  }): InternalTask {
    let resolveDone!: () => void
    const donePromise = new Promise<void>((r) => {
      resolveDone = r
    })
    const task: InternalTask = {
      desc: opts.desc,
      donePromise,
      id: opts.id,
      ownerRound: opts.round,
      resolveDone,
      startedAt: Date.now(),
      status: "pending",
      type: opts.type,
      waitingFor: opts.waitingFor,
    }
    this.#map.set(task.id, task)
    this.emit({ task: toTaskInfo(task), type: "task-added" })
    this.#syncHeartbeat()
    return task
  }

  /** Register a pending task (chained behind `dependsOn`). Does not
   *  invoke the tool — that happens once the dependency completes. */
  #registerPending(opts: {
    call: ToolCallPart
    tool: Tool
    ctxBase: ToolContext
    waitingFor: string
    round: symbol
  }): InternalTask {
    // oxlint-disable-next-line sort-keys -- semantic field order
    const task = this.#allocate({
      id: uuidv7(),
      type: opts.tool.name,
      desc: descOfCall(opts.call),
      waitingFor: opts.waitingFor,
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
      if (t.status !== "pending" || t.waitingFor !== completedId) continue
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
      t.waitingFor = undefined
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

    // Pending: never started, will run when its dependency completes.
    // Placeholder uses the standard TaskInfo shape so it's parseable
    // the same way as task_list / heartbeat entries.
    if (task.status === "pending") {
      return {
        content: [{ data: toTaskInfo(task), tag: "task", type: "meta" }],
        id: call.id,
        isError: false,
        meta: stampTaskMeta(undefined, task),
        name: call.name,
        type: "tool-result",
      }
    }

    // Running: capture whatever the streamable has so far (partial output)
    // and append a `<task>` MetaPart with an explicit "still running"
    // hint. Without the hint, models tend to treat partial output as a
    // final answer and respond prematurely; with it they see the state
    // structurally and know the final result will arrive as a later
    // system message. Tagged `<task>` for symmetry with the pending /
    // task_list / heartbeat / task-done entries — same shape everywhere
    // a task surfaces.
    const snap = task.streamable?.poll()
    const baseContent = partialContentFrom(snap)
    const trailer: MetaPart = {
      data: {
        ...toTaskInfo(task),
        hint:
          "Task is still running. Partial output above. The final result " +
          "will arrive as a system message when the task completes; you " +
          "do not need to poll. Continue with other work or wait.",
      },
      tag: "task",
      type: "meta",
    }
    const parts: ContentPart[] = []
    if (typeof baseContent === "string") {
      if (baseContent !== "") parts.push({ text: baseContent, type: "text" })
    } else {
      parts.push(...baseContent)
    }
    parts.push(trailer)
    return {
      content: parts,
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
      dependsOn: task.waitingFor,
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

/** Render an array of `TaskInfo` as a `<tasks>` MetaPart for the model
 *  (heartbeat pulses and `task_list`). Each task lands as one line of
 *  JSON. The `result` field on done tasks is stripped — listing should
 *  give an inventory, not historical output (the result was already
 *  injected as a system message at task-done time, and re-shipping it
 *  on every heartbeat / list call would be a token bomb). */
export function taskInfoPart(info: readonly TaskInfo[]): MetaPart {
  if (info.length === 0) return { data: "no active tasks", tag: "tasks", type: "meta" }
  const data = info.map((t) => JSON.stringify(t, omitResult)).join("\n")
  return { data, tag: "tasks", type: "meta" }
}

/** JSON.stringify replacer that drops the `result` field. Used by
 *  `taskInfoPart` to keep listing payloads bounded. */
function omitResult(key: string, value: unknown): unknown {
  return key === "result" ? undefined : value
}

function toTaskInfo(task: InternalTask): TaskInfo {
  const { id, status, type, desc } = task
  const ms = (task.finishedAt ?? Date.now()) - task.startedAt
  if (status === "running") {
    return { desc, elapsedMs: ms, hasNewOutput: task.streamable?.hasNew?.(), id, status, type }
  }
  if (status === "pending") {
    return { desc, elapsedMs: ms, id, status, type, waitingFor: task.waitingFor ?? "" }
  }
  // status === "done" — `result` is set by `done()` before status flips,
  // so the `?? formatToolError(...)` is just a defensive fallback for
  // a malformed record (shouldn't happen in practice).
  return {
    desc,
    durationMs: ms,
    id,
    result: task.result ?? formatToolError(new ToolError({
      code: "INTERNAL",
      message: `task "${task.id}" completed without a result`,
    })),
    status,
    type,
  }
}

/** Format a finished task as the parts of a system inject. Layout:
 *
 *    <task>{id, type, desc, status: "done", durationMs}</task>
 *    {result body}
 *
 *  The header is the standard `TaskInfo`-shaped JSON so consumers
 *  (model, TUI) can parse it the same way they parse `task_list` and
 *  heartbeat output — same shape everywhere a task surfaces.
 *
 *  The body comes straight from `result.content`. For errors, that
 *  already includes the `<error>{code, message, ...}</error>` MetaPart
 *  + the formatted `❌ CODE: message` block (baked in by
 *  `formatToolError`), so this function doesn't need to special-case
 *  errors — the structured tag and human body ride along with the
 *  result content for any tool failure, anywhere.
 *
 *  System messages can't carry attachments, so any image/pdf/etc. in
 *  the result degrades to a `[image]` placeholder via
 *  `stringifyContent` — best-effort, model still sees *something* was
 *  there. */
function formatTaskCompletion(task: DoneTaskInfo): (TextPart | MetaPart)[] {
  const { result, ...header } = task
  const parts: (TextPart | MetaPart)[] = [
    { data: header, tag: "task", type: "meta" },
  ]
  const bodyText = stringifyContent(result.content)
  if (bodyText !== "") parts.push({ text: bodyText, type: "text" })
  return parts
}

/** Build an `inject`-ready system message for a finished task. */
export function taskCompletionMessage(task: DoneTaskInfo): Message<"system"> {
  return { content: formatTaskCompletion(task), role: "system" }
}
