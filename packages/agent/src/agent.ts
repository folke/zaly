// oxlint-disable no-await-in-loop
import type { Message, MetaPart, Tool, ToolCallPart, ToolContext } from "@zaly/ai"
import type { AgentEvent, AgentStatus, AgentStopReason } from "./events.ts"
import type { AgentOptions, StepResult } from "./types.ts"

import { collect, isContextOverflow } from "@zaly/ai"
import { toError } from "@zaly/shared"
import { Emitter } from "./events.ts"
import { PermissionManager } from "./permissions/index.ts"
import { Session } from "./session/index.ts"
import { StopPolicy } from "./stop.ts"
import { Tasks, taskCompletionMessage, taskInfoPart } from "./tasks.ts"
import { extractToolCalls } from "./utils/index.ts"
import { uuidv7 } from "./utils/uuid.ts"

/**
 * Long-lived agent — drives the multi-turn loop, owns the run-time
 * status / queues, and delegates conversation state to a `Session`.
 *
 * Typical interactive use:
 *
 * ```ts
 * const agent = new Agent({ model, tools })
 * agent.session.on("node", (e) => render(e))
 * agent.send({ role: "user", content: "hi" })          // auto-runs
 * // …user types again later…
 * agent.send({ role: "user", content: "follow-up" })   // queues if running
 * ```
 *
 * Headless / one-shot use is just a thin wrapper on top — see
 * `runAgent` in the test helpers.
 */
export class Agent extends Emitter<AgentEvent> {
  readonly #opts: AgentOptions
  readonly #stopPolicy: StopPolicy
  readonly #permissions: PermissionManager
  readonly #tasks: Tasks
  readonly session: Session
  /** Nesting depth — see `AgentOptions.depth`. Read-only; subagents pass
   *  `parent.depth + 1` when constructing their child. */
  readonly depth: number
  /** Cap on `depth` — see `AgentOptions.maxDepth`. */
  readonly maxDepth: number

  #prompt?: string[]

  #injectQueue: Message[] = []
  #sendQueue: Message[] = []

  #status: AgentStatus = "idle"
  #abortController?: AbortController
  #pauseRequested = false
  #running?: Promise<AgentStopReason>

  /** Pending future-injects scheduled via `scheduleWakeup`. Cleared
   *  whenever the loop becomes active for any reason — the scheduled
   *  inject was a fallback "wake me up at time T if nothing else does,"
   *  and once something else has, the timer is moot. Hints from cancelled
   *  wakeups carry over as a system message so the intent doesn't
   *  evaporate. */
  readonly #wakeups = new Map<string, { timer: ReturnType<typeof setTimeout>; hint?: string }>()

  #lastError?: Error
  #lastStopReason?: AgentStopReason

  constructor(opts: AgentOptions) {
    super()
    this.#opts = opts
    this.#prompt = opts.prompt
    this.depth = opts.depth ?? 0
    this.maxDepth = opts.maxDepth ?? 2
    this.session = opts.session ?? new Session()
    // Idempotent — no-op on a loaded / pre-seeded session, so historical
    // metadata wins over whatever this Agent would record now.
    this.session.start({ modelId: opts.model.id, prompt: this.#prompt })
    for (const m of opts.messages ?? []) this.session.add(m)
    this.#tasks = new Tasks()
    this.#tasks.tools = opts.tools ?? []
    this.#tasks.heartbeatMs = opts.heartbeatMs
    // Post-round task completions inject a system message into the next
    // step, surfacing the result to the model. Round-internal completions
    // are folded into the round's returned parts and don't fire here.
    this.#tasks.on("task-done", ({ task }) => {
      this.inject(taskCompletionMessage(task))
    })
    // Heartbeats keep the agent loop alive while long-running tasks are
    // in flight. Each pulse injects a small system note listing what's
    // still going. Tasks with incremental output ready to read get a
    // `*new*` marker so the model knows to call `task_poll` if it cares.
    this.#tasks.on("heartbeat", ({ running }) => {
      this.inject({
        content: [{ data: taskInfoPart(running), tag: "heartbeat", type: "meta" }],
        role: "system",
      })
    })
    this.#stopPolicy = new StopPolicy(opts.stop)
    this.#stopPolicy.attach(this)
    // `permissions` accepts either a `PermissionManager` instance (for
    // sharing across nested agents — subagents reuse the parent's) or
    // `PermissionOptions` (the common case: construct a fresh manager).
    this.#permissions =
      opts.permissions instanceof PermissionManager
        ? opts.permissions
        : new PermissionManager(opts.permissions)
    this.onEmitError = (error) => {
      // oxlint-disable-next-line no-console
      console.error("Agent event handler threw an error", error)
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Active conversation — delegates to the underlying `Session`. */
  get messages(): readonly Message[] {
    return this.session.messages
  }
  get status(): AgentStatus {
    return this.#status
  }
  /** Token usage from the most recent step's response. Drives
   *  `contextSize` and any "this turn used N tokens" UI. */
  get usage() {
    return this.#stopPolicy.usage
  }
  /** Cumulative token usage across every step in the current run.
   *  Useful for billing-style displays. */
  get totalUsage() {
    return this.#stopPolicy.totalUsage
  }
  /** Logical size of the current conversation in tokens — what the
   *  next request will send as input. Equals the last step's
   *  `input + output` (since the model's reply becomes part of the
   *  next prompt). Returns 0 before any step has run. */
  get contextSize(): number {
    return this.usage.input + this.usage.output
  }
  get lastError(): Error | undefined {
    return this.#lastError
  }
  get lastStopReason(): AgentStopReason | undefined {
    return this.#lastStopReason
  }
  get steps(): number {
    return this.#stopPolicy.steps
  }
  /** Durable system prompt sent on every step. Mutable: assign to
   *  swap behaviour mid-conversation; the change applies on the next
   *  step (the in-flight stream keeps its original prompt). */
  get prompt(): string[] | undefined {
    return this.#prompt
  }
  set prompt(value: string[] | undefined) {
    this.#prompt = value
  }

  /** Tools the model may call. Mutable: assign to swap the available
   *  set mid-conversation; the new set applies on the next step.
   *  Storage lives on the `Tasks` registry — same instance the agent
   *  uses to dispatch and bookkeep long-running work. */
  get tools(): readonly Tool[] {
    return this.#tasks.tools
  }
  set tools(next: Tool[]) {
    this.#tasks.tools = next
  }

  /** The model this agent is running on. Read-only — swap by constructing
   *  a new agent (or wiring a custom dispatch into the underlying
   *  `Provider`). Subagents pull this off the parent at spawn time. */
  get model() {
    return this.#opts.model
  }

  /** Long-running task registry — exposed for the TUI / introspection
   *  tools (`task_list`, etc.). Mutating directly is a foot-gun;
   *  prefer the agent's higher-level surface. */
  get tasks(): Tasks {
    return this.#tasks
  }

  get permissions(): PermissionManager {
    return this.#permissions
  }

  // ── Input ────────────────────────────────────────────────────────────

  /** Append a message and (re)start the loop. The user spoke; the agent
   *  responds. If a loop is currently running, the message lands on the
   *  follow-up queue and is processed after the current turn naturally
   *  stops. Otherwise the loop starts immediately. */
  send(message: Message<"user" | "system">): void {
    if (this.#status === "idle" || this.#status === "paused") {
      this.session.add(message)
      void this.run()
    } else {
      this.#sendQueue.push(message)
    }
  }

  /** Inject a message into the *current* turn — flushed into the
   *  conversation right before the next step's stream. If the
   *  agent is idle/paused, behaves like `send`. */
  inject(message: Message<"user" | "system">): void {
    if (this.#status === "idle" || this.#status === "paused") {
      this.send(message)
    } else {
      this.#injectQueue.push(message)
    }
  }

  /** Schedule a one-shot wake-up at `delayMs` from now. The agent will
   *  receive a system message at that time IF nothing else has woken
   *  the loop in the meantime — task-done injects, heartbeats, and user
   *  messages all auto-cancel pending wakeups (their job was to ensure
   *  the agent gets a turn; if it's already getting one, the timer is
   *  redundant).
   *
   *  Cancelled wakeups don't silently disappear — their `hint`s, if any,
   *  are folded into a system message that lands in the next step
   *  alongside whatever woke the loop. The model sees the hints with a
   *  `status="cancelled"` marker so it knows the timer didn't fire.
   *
   *  Returns the wakeup id (mostly for telemetry / TUI display — the
   *  model can't usefully cancel it later, since by the time it has a
   *  turn to call cancel, the wakeup has either fired or been cancelled
   *  for it). */
  scheduleWakeup(opts: { delayMs: number; hint?: string }): string {
    const id = uuidv7()
    const timer = setTimeout(() => {
      this.#wakeups.delete(id)
      this.inject({
        content: [{ data: { hint: opts.hint, id }, tag: "wakeup", type: "meta" }],
        role: "system",
      })
    }, opts.delayMs)
    timer.unref()
    this.#wakeups.set(id, { hint: opts.hint, timer })
    return id
  }

  /** Cancel all pending wakeups, surfacing their hints as a single
   *  system message so the model can see what was queued. Called from
   *  `#setStatus` whenever the agent transitions to `streaming` — that's
   *  the unambiguous "loop is active" signal. */
  #cancelAllWakeups(): void {
    if (this.#wakeups.size === 0) return
    const carried: { id: string; hint: string }[] = []
    for (const [id, { hint, timer }] of this.#wakeups) {
      clearTimeout(timer)
      if (hint) carried.push({ hint, id })
    }
    this.#wakeups.clear()
    if (carried.length > 0) {
      const parts: MetaPart[] = carried.map((c) => ({
        data: { hint: c.hint, id: c.id, status: "cancelled" as const },
        tag: "wakeup",
        type: "meta",
      }))
      this.#injectQueue.push({ content: parts, role: "system" })
    }
  }

  // ── Loop control ─────────────────────────────────────────────────────

  /** Drive steps until the agent goes idle (no queued messages and
   *  the model stopped naturally) or hits a non-recoverable stop.
   *  Doubles as a resume from `paused` — drains queued messages and
   *  picks the loop back up. If a run is already in flight, returns
   *  the existing promise. */
  run(): Promise<AgentStopReason> {
    if (this.#running) return this.#running
    this.#pauseRequested = false
    this.#lastError = undefined
    this.#running = this.#loop().finally(() => {
      this.#running = undefined
    })
    return this.#running
  }

  async #collect() {
    this.#abortController = new AbortController()
    const stream = this.#opts.model.stream(
      {
        messages: [...this.session.messages],
        prompt: this.#prompt,
        tools: [...this.#tasks.tools],
      },
      {
        ...this.#opts.request,
        signal: this.#abortController.signal,
      }
    )
    return await collect(stream, {
      onEvent: (event) => {
        this.emit({ event, type: "stream-event" })
        void this.#opts.onEvent?.(event)
      },
      onUpdate: this.#opts.onUpdate,
    })
  }

  /** Run exactly one step. Useful for tests and custom drivers
   *  that want to interleave logic between steps. */
  async step(): Promise<StepResult> {
    if (this.#injectQueue.length > 0) {
      for (const m of this.#injectQueue.splice(0)) this.session.add(m)
    }

    this.#setStatus("streaming")

    let collected
    try {
      collected = await this.#collect()
    } catch (error) {
      const err = toError(error)
      const overflow = isContextOverflow({ message: err.message })
      return {
        error: err,
        finishReason: overflow ? "length" : "error",
        kind: overflow ? "context-overflow" : "error",
        usage: { input: 0, output: 0 },
      }
    }

    const result: Omit<StepResult, "kind"> = {
      finishReason: collected.finishReason,
      message: collected.message,
      usage: collected.usage,
    }

    // Silent-overflow check BEFORE committing the message — gives the
    // session a chance to drop it and retry on a compacted history.
    if (
      this.#opts.contextLimit !== undefined &&
      isContextOverflow({
        contextLimit: this.#opts.contextLimit,
        usageInput: collected.usage.input + (collected.usage.cacheRead ?? 0),
      })
    )
      return { kind: "context-overflow", ...result }

    this.session.add(collected.message, {
      finishReason: collected.finishReason,
      modelId: this.#opts.model.id,
      usage: collected.usage,
    })

    const calls = extractToolCalls(collected.message)
    if (calls.length === 0) return { kind: "natural", ...result }

    return {
      kind: "tool-calls",
      toolMessage: await this.#runTools(calls),
      ...result,
    }
  }

  async #runTools(calls: ToolCallPart[]) {
    this.#setStatus("running-tools")
    for (const call of calls) this.emit({ call, type: "tool-call" })

    // The whole batch — including streamable promotion, parallel chains,
    // grace timing, and ownerRound suppression — lives in Tasks.run().
    // What lands back here is a 1:1 array of result parts ready to commit.
    const resultParts = await this.#tasks.run(calls, this.#toolContext())

    for (let i = 0; i < calls.length; i++) {
      const part = resultParts[i]
      this.emit({
        call: calls[i],
        result: {
          content: part.content,
          error: part.error,
          isError: part.isError ?? false,
          meta: part.meta,
        },
        type: "tool-result",
      })
    }
    const message: Message<"tool"> = { content: resultParts, role: "tool" }
    this.session.add(message)
    return message
  }

  /** Resolve when the agent is in a quiescent state — `idle` or
   *  `paused`. If a run is currently in flight (or was just kicked off
   *  synchronously by `send` / `inject` / a wakeup), waits for it to
   *  settle before returning the final status. If no run is in flight,
   *  resolves immediately with the current status.
   *
   *  Use this in REPL-style drivers to await the loop without racing
   *  with internally-triggered runs (the wakeup timer, heartbeat, or
   *  task-completion injects all spawn `void this.run()` independently
   *  of caller-driven `await agent.run()`). The `#running` promise is
   *  set synchronously inside `run()` before any await point, so this
   *  catches every kicked-off cycle including the one `send` just fired.
   *
   *  Errors from the loop are swallowed — callers read `agent.lastError`
   *  / `agent.lastStopReason` for diagnostics. The point of `waitIdle`
   *  is just to know "the loop is no longer driving." */
  async waitIdle(): Promise<AgentStatus> {
    if (this.#running) await this.#running.catch(() => undefined)
    return this.#status
  }

  /** Pause after the current step completes. The loop exits with
   *  `stopReason: "paused"`; queued messages are preserved. */
  pause(): void {
    this.#pauseRequested = true
  }

  /** Abort the in-flight stream immediately. The agent lands in
   *  `paused` with `lastError` set to an AbortError. */
  abort(): void {
    this.#abortController?.abort()
  }

  // ── Internals ────────────────────────────────────────────────────────

  async #loop(): Promise<AgentStopReason> {
    // Reset per-run counters (steps, consecutive errors, call history).
    // Token totals stay sticky across resets — they're billing-style
    // displays, not per-turn caps.
    this.#stopPolicy.reset()

    for (;;) {
      if (this.#pauseRequested) return this.#stop("paused")

      const outcome = await this.step()
      this.emit({ outcome: outcome.kind, type: "step-end" })

      if (outcome.kind === "error") {
        this.#lastError = outcome.error
        return this.#stop(outcome.error?.name === "AbortError" ? "aborted" : "error")
      }

      if (outcome.kind === "natural") {
        // Drain follow-up queue if anything arrived during the turn.
        if (this.#sendQueue.length > 0) {
          for (const m of this.#sendQueue.splice(0)) this.session.add(m)
          continue
        }
        // Wakeups (or any other inject) that fired while the agent was
        // streaming / running-tools land in `#injectQueue`. If we stop
        // here without giving them a turn, they get drained at the top
        // of the next unrelated user turn — surfacing the wakeup AFTER
        // the user's reply, with no `status="cancelled"` marker since it
        // never went through `#cancelAllWakeups`. Continue the loop so
        // `step()` drains them next iteration.
        if (this.#injectQueue.length > 0) continue
        return this.#stop("natural")
      }

      if (outcome.kind === "context-overflow") {
        if (!this.#opts.compact) return this.#stop("context-overflow")
        // Compactor mutates the conversation; the rejected message is
        // not committed — next step retries on the compacted state.
        await this.#opts.compact(this)
        continue
      }

      // outcome.kind === "tool-calls" — consult the policy.
      const stop = this.#stopPolicy.detect()
      if (stop) return this.#stop(stop)
    }
  }

  #stop(reason: AgentStopReason): AgentStopReason {
    this.#lastStopReason = reason
    this.#setStatus(reason === "natural" ? "idle" : "paused")
    this.emit({ reason, type: "stop", usage: this.usage })
    return reason
  }

  /** Build the per-step `ToolContext` handed to each tool. The session
   *  cwd, an abort signal scoped to the in-flight stream, and the
   *  long-running spawn registry are all surfaced here. */
  #toolContext(): ToolContext {
    return {
      agent: this,
      cwd: this.#permissions.cwd,
      messages: this.session.messages,
      perms: this.#permissions,
      signal: this.#abortController?.signal,
      tasks: this.#tasks,
    }
  }

  /** Tear down session-scoped resources. Called on agent disposal — the
   *  agent doesn't auto-dispose today, so callers (TUI on quit, headless
   *  runner on completion) should invoke this explicitly. */
  async dispose(): Promise<void> {
    this.#cancelAllWakeups()
    await this.#tasks.killAll()
  }

  #setStatus(status: AgentStatus): void {
    const prev = this.#status
    if (prev === status) return
    // Cancel wakeups only when an EXTERNAL wake-up brings the loop back
    // to active (idle/paused → streaming). Mid-turn transitions
    // (running-tools → streaming) are the same turn continuing — a
    // wakeup the model just scheduled mid-tool-call would otherwise be
    // killed before it ever fires. The "external wake-up" cases that
    // *should* cancel: a `task-done` inject, a heartbeat, a user
    // message — all route through `inject` → `send` → `run` from the
    // idle/paused state, hitting this branch correctly.
    if (status === "streaming" && (prev === "idle" || prev === "paused")) {
      this.#cancelAllWakeups()
    }
    this.#status = status
    this.emit({ status, type: "status" })
  }
}
