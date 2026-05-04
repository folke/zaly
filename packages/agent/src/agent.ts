// oxlint-disable no-await-in-loop
import type { Message, MetaPart, Tool, ToolCallPart, ToolContext } from "@zaly/ai"
import type { Compaction, CompactionOptions } from "./compaction/compactions.ts"
import type { AgentEvents, AgentStatus, AgentStopReason } from "./events.ts"
import type { AgentInit, AgentOptions, ContextPressure, StepResult } from "./types.ts"

import { AiError, collect, isContextOverflow, validateToolParams } from "@zaly/ai"
import { Emitter, normPath, toError } from "@zaly/shared"
import { Masker } from "./masker.ts"
import { Notifier } from "./notify.ts"
import { PermissionManager } from "./permissions/index.ts"
import { promptRegistry } from "./prompt/index.ts"
import { Session } from "./session/index.ts"
import { Skills } from "./skills.ts"
import { StopPolicy } from "./stop.ts"
import { Swarm } from "./swarm.ts"
import { Tasks, taskCompletionMessage, taskInfoPart } from "./tasks.ts"
import { toolRegistry } from "./tools/index.ts"
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
  readonly #opts: AgentInit
  readonly #masker?: Masker
  readonly #notifier?: Notifier
  readonly #permissions: PermissionManager
  readonly #skills?: Skills
  readonly #stopPolicy: StopPolicy
  readonly #swarm: Swarm
  readonly #tasks: Tasks
  readonly session: Session
  /** Nesting depth — see `AgentOptions.depth`. Read-only; subagents pass
   *  `parent.depth + 1` when constructing their child. */
  readonly depth: number
  /** Cap on `depth` — see `AgentOptions.maxDepth`. */
  readonly maxDepth: number

  #prompt?: string[]
  #parent?: Agent

  #injectQueue: Message[] = []
  #sendQueue: Message[] = []
  #notifyQueue: MetaPart[] = []
  #cwd: string

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
  protected constructor(opts: AgentInit) {
    super()
    this.#opts = opts
    this.#cwd = opts.cwd
    this.#prompt = (opts.prompt ?? []).map((p) => p.trim()).filter((p) => p !== "")
    this.depth = opts.depth ?? 0
    this.maxDepth = opts.maxDepth ?? 2
    this.session = opts.session

    // Idempotent — no-op on a loaded / pre-seeded session, so historical
    // metadata wins over whatever this Agent would record now.
    this.session.start({
      cwd: this.#cwd,
      modelId: opts.model.id,
      prompt: this.#prompt,
    })
    for (const m of opts.messages ?? []) this.session.add(m)

    this.#tasks = new Tasks()
    this.#tasks.tools = [...(opts.tools ?? []), () => this.#skills?.tool]
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
    // `permissions` accepts either a `PermissionManager` instance (for
    // sharing across nested agents — subagents reuse the parent's) or
    // `PermissionOptions` (the common case: construct a fresh manager).
    this.#permissions =
      opts.permissions instanceof PermissionManager
        ? opts.permissions
        : new PermissionManager({ ...opts.permissions, cwd: this.#cwd })
    this.#skills = opts.skills
    this.#swarm = opts.swarm ?? new Swarm()
    // Notifier defaults to enabled with sensible thresholds. `false`
    // turns it off (tests usually pass this so injected notifications
    // don't show up in conversation expectations); a `NotifyOptions`
    // object tunes thresholds while keeping it active.
    if (opts.notify !== false) {
      this.#notifier = new Notifier(typeof opts.notify === "object" ? opts.notify : {})
    }
    // Masking is on by default — `false` disables; `MaskOptions` tunes;
    // `true` / undefined → default policy.
    if (opts.masking !== false) {
      this.#masker = new Masker(typeof opts.masking === "object" ? opts.masking : {})
    }
    this.onEmitError = (error) => {
      // oxlint-disable-next-line no-console
      console.error("Agent event handler threw an error", error)
    }
  }

  /** Recommended one-step path to a ready agent. Constructs the agent,
   *  then runs any async setup the harness expects to be done before
   *  the first `run()` (currently: skills discovery; future: MCP server
   *  registration, model availability checks, …).
   *
   *  Tests / harnesses that want a synchronous build can subclass and
   *  call the protected constructor, or skip the async setup with
   *  `skills: false` and equivalent flags. */
  static async load(opts: AgentOptions): Promise<Agent> {
    // Resolve `session: SessionOptions | Session` → a built `Session`.
    // Pre-built instances pass through (Claude loader, multi-agent
    // sharing); options get hydrated from disk + writer-attached.
    const cwd = normPath(opts.cwd)
    const session =
      opts.session instanceof Session ? opts.session : await Session.load({ ...opts.session, cwd })
    let skills: Skills | undefined
    if (opts.skills === false) skills = undefined
    else if (opts.skills instanceof Skills) skills = opts.skills
    else skills = await Skills.load({ cwd })
    const toolInit = { cwd, model: opts.model }
    const tools: Tool[] = await Promise.all(
      (opts.tools ?? []).map((t) =>
        Promise.resolve(typeof t === "string" ? toolRegistry.load(t, toolInit) : t)
      )
    )
    const promptCtx = { cwd, model: opts.model }
    const prompts = opts.prompt ?? [
      { use: "agent" },
      { use: "env" },
      { use: "model" },
      { use: "AGENTS.md" },
      { use: "MEMORY.md" },
    ]
    const prompt = await Promise.all(
      prompts.map(async (p) => (typeof p === "string" ? p : promptRegistry.load(p.use, promptCtx)))
    )
    const init: AgentInit = { ...opts, cwd, prompt, session, skills, tools }
    const agent = new Agent(init)
    return agent
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
    let tools = [...this.tools].filter((t) => t.name !== "skill")
    if (childDepth >= this.maxDepth) tools = tools.filter((t) => t.name !== "subagent")
    const ret = await Agent.load({
      caching: this.#opts.caching,
      cwd: this.#cwd,
      depth: childDepth,
      masking: this.#opts.masking,
      maxDepth: this.maxDepth,
      model: this.model,
      // Inherit the parent's `notify` setting so test roots that
      // disable the notifier (`notify: false`) propagate that to
      // children — otherwise spawning a child would silently re-enable
      // session-started / time / etc. injections that the harness
      // explicitly opted out of.
      notify: this.#opts.notify,
      permissions: this.#permissions,
      skills: this.#skills ?? false, // shared catalog; child doesn't reload
      // Propagate the swarm so the child + every grandchild address
      // each other through the same registry. Override-able via
      // `overrides.swarm` if a caller wants the child outside the
      // tree (rare).
      swarm: this.#swarm,
      tools,
      ...overrides,
    })
    ret.#parent = this
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
    return this.#cwd
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
  /** Durable system prompt sent on every step. Mutable: assign to
   *  swap behaviour mid-conversation; the change applies on the next
   *  step (the in-flight stream keeps its original prompt). */
  get prompt(): string[] | undefined {
    return this.#prompt
  }
  set prompt(value: string[] | undefined) {
    this.#prompt = value
  }

  get parent(): Agent | undefined {
    return this.#parent
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

  /** Skills registry for this agent. `undefined` when constructed with
   *  `skills: false`. The TUI uses this for `/skill` autocomplete; the
   *  agent itself appends `skills.tool` to the model's tool list each
   *  step so a loaded catalog is automatically reachable. Call
   *  `agent.skills?.load()` to populate; re-call to pick up newly
   *  installed skills mid-session. */
  get skills(): Skills | undefined {
    return this.#skills
  }

  /** Swarm registry this agent belongs to. `undefined` for standalone
   *  agents. Children inherit this via `Agent.child(...)`. The TUI
   *  reads it for `/agents` listings; tools read it via `ctx.swarm`. */
  get swarm(): Swarm | undefined {
    return this.#swarm
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

  notify(meta: Omit<MetaPart, "type">): void
  notify(msg: string, tag?: string): void
  notify(metaOrMsg: Omit<MetaPart, "type"> | string, tag?: string): void {
    if (typeof metaOrMsg === "string")
      this.#notifyQueue.push({
        content: [{ text: metaOrMsg, type: "text" }],
        tag: tag ?? "notify",
        type: "meta",
      })
    else this.#notifyQueue.push({ ...metaOrMsg, type: "meta" } as MetaPart)
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

  get #masked(): readonly Message[] {
    if (!this.#masker) return this.session.messages
    return this.#masker.apply(this.session.messages, this.pressure)
  }

  async #collect() {
    this.#abortController = new AbortController()
    const caching = this.#opts.caching !== false
    const stream = this.#opts.model.stream(
      {
        messages: this.#withCacheMarker([...this.#masked], caching),
        prompt: this.#prompt,
        tools: [...this.tools],
      },
      this.#streamOpts(caching)
    )
    return await collect(stream, {
      onEvent: (event) => {
        this.emit("stream-event", { event })
        void this.#opts.onEvent?.(event)
      },
      onUpdate: this.#opts.onUpdate,
    })
  }

  #shouldAutoCompact(): boolean {
    const auto = this.#opts.compaction?.auto ?? true
    if (!auto) return false
    const threshold = this.#opts.compaction?.treshold ?? 0.85
    return this.pressure.ratio >= threshold
  }

  /** Mark the trailing message as a cache breakpoint. Anthropic's
   *  adapter places `cache_control` on that message's last content
   *  block, caching the prefix up through it. The marker rolls forward
   *  each turn — every request hits the previous turn's cache. */
  #withCacheMarker(messages: Message[], caching: boolean): Message[] {
    if (!caching || messages.length === 0) return messages
    const last = messages[messages.length - 1]
    // Respect an explicit hint from the caller — don't override.
    if (last.cache !== undefined) return messages
    messages[messages.length - 1] = { ...last, cache: { type: "ephemeral" } }
    return messages
  }

  /** Build the per-stream `StreamOptions`. Adds `cacheTools: true` for
   *  Anthropic when caching is on so the trailing tool definition gets
   *  marked, caching the `system + tools` prefix across the session. */
  #streamOpts(caching: boolean) {
    const base = this.#opts.request ?? {}
    const signal = this.#abortController?.signal
    if (!caching) return { ...base, signal }
    return {
      ...base,
      providerOptions: {
        ...base.providerOptions,
        anthropic: { cacheTools: true, ...base.providerOptions?.anthropic },
      },
      signal,
    }
  }

  /** Run exactly one step. Useful for tests and custom drivers
   *  that want to interleave logic between steps. */
  async step(): Promise<StepResult> {
    if (this.#shouldAutoCompact()) await this.compact()
    this.#notifier?.check({ agent: this })
    // Drain the notify queue into the inject queue as a single system message
    if (this.#notifyQueue.length > 0) {
      this.#injectQueue.push({
        content: this.#notifyQueue.splice(0),
        role: "system",
      })
    }

    // Add any injected messages
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
        // Total prompt size = uncached input + cached reads + cached
        // writes. `usage.input` is uncached-only; the cache fields are
        // separate billing tiers that still occupy the context window.
        usageInput:
          collected.usage.input +
          (collected.usage.cacheRead ?? 0) +
          (collected.usage.cacheWrite ?? 0),
      })
    )
      return { kind: "context-overflow", ...result }

    const calls = this.#parseToolCalls(collected.message)
    this.session.add(collected.message, {
      finishReason: collected.finishReason,
      usage: collected.usage,
    })

    if (calls.length === 0) return { kind: "natural", ...result }

    return {
      kind: "tool-calls",
      toolMessage: await this.#runTools(calls),
      ...result,
    }
  }

  #parseToolCalls(message: Message): ToolCallPart[] {
    if (typeof message.content === "string") return []
    const calls = message.content.filter((p): p is ToolCallPart => p.type === "tool-call")
    for (const call of calls) {
      const tool = this.tools.find((t) => t.name === call.name)
      if (!tool) continue
      try {
        call.params = validateToolParams(tool, call.params) ?? call.params
      } catch {}
    }
    return calls
  }

  async compact() {
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
    for (const call of calls) this.emit("tool-call", { call })

    // The whole batch — including streamable promotion, parallel chains,
    // grace timing, and ownerRound suppression — lives in Tasks.run().
    // What lands back here is a 1:1 array of result parts ready to commit.
    // The skill tool (when active) is passed via `extraTools` so dispatch
    // can resolve `name: "skill"` calls without polluting `tasks.tools`.
    const skill = this.#skills?.tool
    const resultParts = await this.#tasks.run(calls, this.#toolContext(), {
      extraTools: skill ? [skill] : [],
    })

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
      this.emit("step-end", { outcome: outcome.kind })

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
      cwd: this.#cwd,
      messages: this.session.messages,
      need: (scope, input) => this.#need(scope, input),
      perms: this.#permissions,
      signal: this.#abortController?.signal,
      swarm: this.#swarm,
      tasks: this.#tasks,
    }
  }

  /** Implementation of `ctx.need(scope, input)`. Resolves on `allow`,
   *  throws a `PERMISSION_DENIED` `AiError` on `deny`, and escalates
   *  `ask` to `AgentOptions.allow` (treating it as `deny` when no
   *  callback is configured). */
  async #need(scope: string, input: string): Promise<void> {
    const r = this.#permissions.validate(scope, input)
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
