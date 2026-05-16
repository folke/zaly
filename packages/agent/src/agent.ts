// oxlint-disable no-await-in-loop
import type {
  AssistantMessage,
  Content,
  Message,
  MetaPart,
  Model,
  ModelStreamOptions,
  TokenCount,
  ToolCallPart,
  ToolContext,
} from "@zaly/ai"
import type { CompactionOptions } from "./compaction/compactions.ts"
import type { AgentEvents, AgentStatus, AgentStopReason } from "./events.ts"
import type { AgentContext } from "./load.ts"
import type { Session } from "./session/session.ts"
import type { AgentOptions, ContextPressure, StepResult } from "./types.ts"

import { AiError, isContextOverflow } from "@zaly/ai"
import { Emitter, toError } from "@zaly/shared"
import { StopPolicy } from "./stop.ts"
import { Tasks, taskCompletionMessage, taskInfoPart } from "./tasks.ts"
import { uuidv7 } from "./utils/uuid.ts"

const PRESSURE_LEVELS = [0.75, 0.85, 0.95] as const

/**
 * Long-lived agent — drives the multi-turn loop, owns the run-time
 * status / queues, and delegates conversation state to a `Session`.
 *
 * Typical interactive use:
 *
 * ```ts
 * const agent = await Agent.load({ model, tools })
 * agent.session.on("node", (e) => render(e))
 * agent.send({ role: "user", content: "hi" })          // auto-runs
 * // …user types again later…
 * agent.send({ role: "user", content: "follow-up" })   // queues if running
 * ```
 *
 * Headless / one-shot use is just a thin wrapper on top — see
 * `runAgent` in the test helpers.
 */
export class Agent extends Emitter<AgentEvents> {
  readonly #opts: AgentOptions
  readonly #ctx: AgentContext
  readonly #stopPolicy: StopPolicy
  readonly #tasks: Tasks
  /** Nesting depth — see `AgentOptions.depth`. Read-only; subagents pass
   *  `parent.depth + 1` when constructing their child. */
  readonly depth: number
  /** Cap on `depth` — see `AgentOptions.maxDepth`. */
  readonly maxDepth: number

  #parent?: Agent

  #injectQueue: Message[] = []
  #sendQueue: Message[] = []
  #notifyQueue: MetaPart[] = []

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

  /** Synchronous, low-level constructor. Prefer `Agent.load(opts)` —
   *  it runs the same construction *plus* any async setup (resolving
   *  `session: SessionOptions` to a built `Session`, skills discovery,
   *  future warm-ups). The constructor is `protected` so test doubles /
   *  subclasses can still call `super(init)` directly; they're
   *  responsible for providing a pre-built `Session` on `init.session`. */
  public constructor(ctx: AgentContext) {
    super()
    const opts = ctx.opts
    this.#ctx = ctx
    this.#opts = ctx.opts
    this.depth = opts.depth ?? 0
    this.maxDepth = opts.maxDepth ?? 2

    // Note: session.update() + initial messages are committed
    // asynchronously from `Agent.load`, NOT here. Constructors can't
    // be async; deferring those writes until after construction also
    // gives consumers a window to subscribe to session events before
    // the first node fires.

    this.#tasks = new Tasks()
    this.#tasks.$tools = async () => await this.tools()
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
        content: [{ content: [taskInfoPart(running)], tag: "heartbeat", type: "meta" }],
        role: "system",
      })
    })

    this.#stopPolicy = new StopPolicy(opts.stop)
    this.#stopPolicy.attach(this)
    this.onEmitError = (error) => {
      // oxlint-disable-next-line no-console
      console.error("Agent event handler threw an error", error)
    }
  }

  /** Spawn a child agent that inherits this agent's runtime defaults —
   *  cwd, model, permissions, full effective tool list (user tools +
   *  the loaded skill tool), `depth + 1`, and `maxDepth`. Pass
   *  `overrides` to specialize: typical ones are `prompt` (the child
   *  has its own role), `session` (the child writes to its own JSONL),
   *  and `tools` (curated subset).
   *
   *  Used by the `subagent` tool for delegation; equally useful for
   *  ad-hoc parallel-agent patterns (multiple children working on
   *  pieces of a task in parallel).
   *
   *  Depth cap: when the child would be at `maxDepth`, the `subagent`
   *  tool is filtered out of its inherited tool list so recursion
   *  bottoms out cleanly. The model just doesn't see the tool — no
   *  error path. */
  async child(overrides: Partial<AgentOptions> = {}): Promise<Agent> {
    const childDepth = overrides.depth ?? this.depth + 1
    // Inherit the *effective* step tool list (includes the loaded
    // `skill` tool). The child opts out of its own skill scan since
    // the catalog is shared.

    let tools = [...(await this.tools())].filter((t) => t.name !== "skill")
    if (childDepth >= this.maxDepth) tools = tools.filter((t) => t.name !== "subagent")
    const { createAgent } = await import("./load.ts")

    const ret = await createAgent({
      cwd: this.cwd,
      depth: childDepth,
      mask: this.#opts.mask,
      maxDepth: this.maxDepth,
      model: this.model,
      // Inherit the parent's `notify` setting so test roots that
      // disable the notifier (`notify: false`) propagate that to
      // children — otherwise spawning a child would silently re-enable
      // session-started / time / etc. injections that the harness
      // explicitly opted out of.
      notify: this.#opts.notify,
      permissions: this.ctx.permissions,
      skills: this.#ctx.skills ?? false, // shared catalog; child doesn't reload
      // Propagate the swarm so the child + every grandchild address
      // each other through the same registry. Override-able via
      // `overrides.swarm` if a caller wants the child outside the
      // tree (rare).
      swarm: this.#ctx.swarm,
      tools,
      ...overrides,
    })
    ret.#parent = this
    // Children are spawned ready — subagent dispatch typically calls
    // `.send()` immediately after, and inspecting `child.tools` /
    // `child.prompt` before sending should just work.
    await ret.start()
    return ret
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Active conversation — delegates to the underlying `Session`. */
  get messages(): readonly Message[] {
    return this.session.messages
  }

  get status(): AgentStatus {
    return this.#status
  }

  get cwd(): string {
    return this.#ctx.cwd
  }

  get model(): Model {
    return this.#ctx.model
  }

  get session(): Session {
    return this.#ctx.session
  }

  get skills() {
    return this.#ctx.skills
  }

  get signal(): AbortSignal | undefined {
    return this.#abortController?.signal
  }

  /** Token usage from the most recent step's response. Drives
   *  `contextSize` and any "this turn used N tokens" UI. */
  get usage(): TokenCount {
    return this.#stopPolicy.usage
  }
  /** Cumulative token usage across every step in the current run.
   *  Useful for billing-style displays. */
  get totalUsage(): TokenCount {
    return this.#stopPolicy.totalUsage
  }
  /** Logical size of the current conversation in tokens — what the
   *  next request will send as input. Equals the last step's
   *  `input + output` (since the model's reply becomes part of the
   *  next prompt). Returns 0 before any step has run. */
  get contextSize(): number {
    return (
      this.usage.input +
      this.usage.output +
      (this.usage.cacheRead ?? 0) +
      (this.usage.cacheWrite ?? 0)
    )
  }
  get pressure(): ContextPressure {
    const used = this.contextSize
    // Defensive: test mocks sometimes lack `spec` even when the type
    // declares it required. Bare `this.model.spec.limit.context` would
    // throw on those mocks; treat missing fields as "no known limit"
    // (level 0, no pressure-driven masking).
    const spec = (this.model as { spec?: { limit?: { context?: number } } }).spec
    const limit = spec?.limit?.context ?? 0
    const ratio = limit > 0 ? used / limit : 0
    const level = PRESSURE_LEVELS.findLast((t) => ratio >= t) ?? 0
    return { level, limit, ratio, used }
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

  get parent(): Agent | undefined {
    return this.#parent
  }

  async tools() {
    return this.#ctx.tools()
  }

  async prompt() {
    return this.#ctx.prompt()
  }

  get ctx(): AgentContext {
    return this.#ctx
  }

  /** Long-running task registry — exposed for the TUI / introspection
   *  tools (`task_list`, etc.). Mutating directly is a foot-gun;
   *  prefer the agent's higher-level surface. */
  get tasks(): Tasks {
    return this.#tasks
  }

  // ── Input ────────────────────────────────────────────────────────────

  /** Append a message and (re)start the loop. The user spoke; the agent
   *  responds. If a loop is currently running, the message lands on the
   *  follow-up queue and is processed after the current turn naturally
   *  stops. Otherwise the loop starts immediately. */
  send(message: Message<"user" | "system">): void {
    // Always queue — keeps `send()` synchronous (session.add is async
    // now). The loop drains the queue at the top of each step() before
    // reading session.messages, so message ordering is preserved.
    this.#sendQueue.push(message)
    if (this.#status === "idle" || this.#status === "paused") void this.run()
  }

  /** Inject a message into the *current* turn — flushed into the
   *  conversation right before the next step's stream. If the agent
   *  is idle/paused, behaves like `send`: queues and triggers a run.
   *  Wakeups, notifier messages, swarm-delivered messages, and the
   *  CLI's user submit all flow through here — the model should pick
   *  them up on the next step regardless of agent state. */
  inject(message: Message<"user" | "system">): void {
    if (this.#status === "idle" || this.#status === "paused") {
      this.send(message)
    } else {
      this.#injectQueue.push(message)
    }
  }

  notify(type: string, data: Content | Record<string, unknown>): void {
    const meta: MetaPart =
      typeof data === "string" || Array.isArray(data)
        ? { content: data, tag: type, type: "meta" }
        : { data, tag: type, type: "meta" }
    this.#notifyQueue.push(meta)
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
    return this.model.stream(
      {
        messages: [...this.ctx.streamMessages],
        prompt: await this.prompt(),
        tools: await this.tools(),
      },
      this.#streamOpts()
    )
  }

  #shouldAutoCompact(): boolean {
    const auto = this.#opts.compaction?.auto ?? true
    if (!auto) return false
    const threshold = this.#opts.compaction?.treshold ?? 0.85
    return this.pressure.ratio >= threshold
  }

  #streamOpts(): ModelStreamOptions {
    const base = this.#opts.request ?? {}
    return {
      ...base,
      onEvent: (event) => {
        this.emit("stream-event", { event })
        void this.#opts.onEvent?.(event)
      },
      onUpdate: this.#opts.onUpdate,
      signal: this.#abortController?.signal,
    }
  }

  /** Run exactly one step. Useful for tests and custom drivers
   *  that want to interleave logic between steps. */
  async step(): Promise<StepResult> {
    if (this.#shouldAutoCompact()) await this.compact()
    // Drain the notify queue into the inject queue as a single system message
    if (this.#notifyQueue.length > 0) {
      this.#injectQueue.push({
        content: this.#notifyQueue.splice(0),
        role: "system",
      })
    }

    // Drain the send queue (user-submitted via `send()`) and the inject
    // queue (notifier / wakeup / hooks). Sequential await preserves
    // chronological order on the session.
    for (const m of this.#sendQueue.splice(0)) await this.session.add(m)
    for (const m of this.#injectQueue.splice(0)) await this.session.add(m)

    this.#setStatus("streaming")

    let collected: AssistantMessage

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
      finishReason: collected.meta.finishReason,
      message: collected,
      usage: collected.meta.usage,
    }

    // Silent-overflow check BEFORE committing the message — gives the
    // session a chance to drop it and retry on a compacted history.
    if (
      this.#opts.contextLimit !== undefined &&
      isContextOverflow({
        contextLimit: this.#opts.contextLimit,
        // Total prompt size = uncached input + cached reads + cached
        // writes. `usage.input` is uncached-only; the cache fields are
        // separate billing tiers that still occupy the context window.
        usageInput:
          result.usage.input + (result.usage.cacheRead ?? 0) + (result.usage.cacheWrite ?? 0),
      })
    )
      return { kind: "context-overflow", ...result }

    const calls = await this.#parseToolCalls(collected)
    await this.session.add(collected)

    if (calls.length === 0) return { kind: "natural", ...result }

    return {
      kind: "tool-calls",
      toolMessage: await this.#runTools(calls),
      ...result,
    }
  }

  async #parseToolCalls(message: Message): Promise<ToolCallPart[]> {
    if (typeof message.content === "string") return []
    const calls = message.content.filter((p): p is ToolCallPart => p.type === "tool-call")
    const tools = await this.tools()
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.name)
      if (!tool) continue
      try {
        call.params = (await tool.validator.validateParams(call.params)) ?? call.params
      } catch {}
    }
    return calls
  }

  async compact(): Promise<void> {
    const prev = this.#status
    this.#setStatus("compacting")
    try {
      const Compaction = await import("./compaction/compactions.ts").then((m) => m.Compaction)
      const opts: Partial<CompactionOptions> = {
        ...this.#opts.compaction,
        signal: this.#abortController?.signal,
      }
      const compactor = new Compaction(this, opts)
      await compactor.compact()
    } finally {
      this.#setStatus(prev)
    }
  }

  async #runTools(calls: ToolCallPart[]) {
    this.#setStatus("running-tools")
    this.emit("tool-calls", { calls })
    for (const call of calls) this.emit("tool-call", { call })

    // The whole batch — including streamable promotion, parallel chains,
    // grace timing, and ownerRound suppression — lives in Tasks.run().
    // What lands back here is a 1:1 array of result parts ready to commit.
    // The skill tool (when active) is passed via `extraTools` so dispatch
    // can resolve `name: "skill"` calls without polluting `tasks.tools`.
    const resultParts = await this.#tasks.run(calls, this.#toolContext())

    for (let i = 0; i < calls.length; i++) {
      const part = resultParts[i]
      this.emit("tool-result", {
        call: calls[i],
        result: {
          content: part.content,
          error: part.error,
          isError: part.isError ?? false,
          meta: part.meta,
        },
      })
    }
    const message: Message<"tool"> = { content: resultParts, role: "tool" }
    await this.session.add(message)
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
  async waitIdle(timeout?: number): Promise<AgentStatus> {
    if (!this.#running) return this.#status
    const wait = [this.#running.catch(() => undefined)]
    if (timeout !== undefined) wait.push(new Promise((resolve) => setTimeout(resolve, timeout)))
    await Promise.race(wait)
    return this.#status
  }

  /** Pause after the current step completes. The loop exits with
   *  `stopReason: "paused"`; queued messages are preserved. */
  pause(): void {
    this.#pauseRequested = true
  }

  /** Abort the in-flight stream immediately. The agent lands in
   *  `paused` with `lastError` set to an AbortError. */
  abort(reason?: string): void {
    this.#abortController?.abort(reason)
  }

  async start() {
    if (this.ctx.started) return
    await this.ctx.start()
    this.emit("start")
  }

  // ── Internals ────────────────────────────────────────────────────────

  async #loop(): Promise<AgentStopReason> {
    if (!this.ctx.started) await this.start()
    // Reset per-run counters (steps, consecutive errors, call history).
    // Token totals stay sticky across resets — they're billing-style
    // displays, not per-turn caps.
    this.#stopPolicy.reset()

    for (let step = 1; ; step++) {
      if (this.#pauseRequested) return this.#stop("paused")

      this.emit("step-start", { step })
      const outcome = await this.step()
      this.emit("step-end", { outcome: outcome.kind, step })

      if (outcome.kind === "error") {
        this.#lastError = outcome.error
        return this.#stop(outcome.error?.name === "AbortError" ? "aborted" : "error")
      }

      if (outcome.kind === "natural") {
        // Drain follow-up queue if anything arrived during the turn.
        if (this.#sendQueue.length > 0) {
          for (const m of this.#sendQueue.splice(0)) await this.session.add(m)
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
        // Auto-compaction also gates the overflow recovery path. With
        // `auto: false`, overflow stops cleanly instead of attempting
        // a recovery the user explicitly opted out of.
        if (this.#opts.compaction?.auto === false) return this.#stop("context-overflow")
        // Compactor mutates the conversation; the rejected message is
        // not committed — next step retries on the compacted state.
        await this.compact()
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
    this.emit("stop", { reason, usage: this.usage })
    return reason
  }

  /** Build the per-step `ToolContext` handed to each tool. The session
   *  cwd, an abort signal scoped to the in-flight stream, and the
   *  long-running spawn registry are all surfaced here. */
  #toolContext(): ToolContext {
    return {
      agent: this,
      cwd: this.cwd,
      messages: this.session.messages,
      need: (scope, input) => this.#need(scope, input),
      perms: this.ctx.permissions,
      signal: this.#abortController?.signal,
      swarm: this.#ctx.swarm,
      tasks: this.#tasks,
    }
  }

  /** Implementation of `ctx.need(scope, input)`. Resolves on `allow`,
   *  throws a `PERMISSION_DENIED` `AiError` on `deny`, and escalates
   *  `ask` to `AgentOptions.allow` (treating it as `deny` when no
   *  callback is configured). */
  async #need(scope: string, input: string): Promise<void> {
    const r = this.ctx.permissions.validate(scope, input)
    if (r.verdict === "allow") return
    if (r.verdict === "ask" && this.#opts.allow) {
      const ok = await this.#opts.allow({
        input,
        reason: r.reason,
        scope,
        suggestions: r.suggestions,
      })
      if (ok) return
    }
    throw new AiError({
      code: "PERMISSION_DENIED",
      data: { input, scope, suggestions: r.suggestions, verdict: r.verdict },
      message: r.reason,
      // `ask` verdicts that the user denied this turn are retryable —
      // they may add a rule later. Hard `deny` is not.
      retryable: r.verdict === "ask",
    })
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
    this.emit("status", { status })
  }
}
