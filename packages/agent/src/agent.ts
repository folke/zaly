// oxlint-disable no-await-in-loop
import type { Message, TokenCount, Tool, ToolCallPart, ToolResultPart } from "@zaly/ai"
import type { AgentStatus, AgentStopReason } from "./events.ts"
import type { AgentSessionOptions, SessionSnapshot, StepResult } from "./types.ts"

import { collect, isContextOverflow, runTool } from "@zaly/ai"
import { Emitter } from "./events.ts"
import { StopPolicy } from "./policy.ts"
import { extractToolCalls, unknownToolResult } from "./utils.ts"

/**
 * Long-lived agent session. Owns the conversation, the run loop, the
 * inline / send queues, and the status state machine. Built on top of
 * `@zaly/ai`'s provider transport and tool primitives.
 *
 * Typical interactive use:
 *
 * ```ts
 * const session = new AgentSession({ model, request: { tools } })
 * const off = session.on((e) => render(e))
 * session.send({ role: "user", content: "hi" })          // auto-runs
 * // …user types again later…
 * session.send({ role: "user", content: "follow-up" })   // queues if running
 * ```
 *
 * Headless / one-shot use is just a thin wrapper on top — see
 * `runAgentTurn` in the test helpers.
 */
export class AgentSession extends Emitter {
  readonly #opts: AgentSessionOptions
  readonly #toolIndex = new Map<string, Tool>()
  readonly #policy: StopPolicy

  #messages: Message[]
  #injectQueue: Message[] = []
  #sendQueue: Message[] = []

  #status: AgentStatus = "idle"
  #abortController?: AbortController
  #pauseRequested = false
  #runPromise?: Promise<AgentStopReason>

  #lastError?: Error
  #lastStopReason?: AgentStopReason

  constructor(opts: AgentSessionOptions) {
    super()
    this.#opts = opts
    this.#messages = [...(opts.initialMessages ?? [])]
    for (const t of opts.request?.tools ?? []) this.#toolIndex.set(t.name, t)
    this.#policy = new StopPolicy(opts)
    this.#policy.attach(this)
    this.onEmitError = (error) => {
      // oxlint-disable-next-line no-console
      console.error("AgentSession event handler threw an error", error)
    }
  }

  // ── Read ──────────────────────────────────────────────────────────────

  get messages(): readonly Message[] {
    return this.#messages
  }
  get status(): AgentStatus {
    return this.#status
  }
  /** Token usage from the most recent step's response. Drives
   *  `contextSize` and any "this turn used N tokens" UI. */
  get usage(): TokenCount {
    return this.#policy.usage
  }
  /** Cumulative token usage across every step in the current run.
   *  Useful for billing-style displays. */
  get totalUsage(): TokenCount {
    return this.#policy.totalUsage
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
    return this.#policy.steps
  }
  /** Durable system prompt — currently the value supplied at
   *  construction. Exposed as a getter so subclasses or future
   *  setter overrides have a single resolution point. */
  get prompt(): string[] | undefined {
    return this.#opts.prompt
  }

  // ── Mutate (used by compactor and external callers) ─────────────────

  /** Append one or more messages to the conversation. Each message
   *  emits a `message` event in order. Does NOT trigger the loop —
   *  use `send()` for that. */
  add(...messages: Message[]): void {
    for (const message of messages) {
      this.#messages.push(message)
      this.emit({ message, type: "message" })
    }
  }

  /** Replace the conversation wholesale. Used by compactors / replay
   *  / branching. Emits a `replace` event with both the previous and
   *  new arrays so subscribers can diff or fully re-render. */
  replace(messages: Message[]): void {
    const before = this.#messages
    this.#messages = [...messages]
    this.emit({ after: this.#messages, before, type: "replace" })
  }

  // ── Input ────────────────────────────────────────────────────────────

  /** Append a message and (re)start the loop. The user spoke; the agent
   *  responds. If a loop is currently running, the message lands on the
   *  follow-up queue and is processed after the current turn naturally
   *  stops. Otherwise the loop starts immediately. */
  send(message: Message): void {
    if (this.#status === "idle" || this.#status === "paused") {
      this.add(message)
      void this.run()
    } else {
      this.#sendQueue.push(message)
    }
  }

  /** Inject a message into the *current* turn — flushed into the
   *  conversation right before the next step's stream. If the
   *  session is idle/paused, behaves like `send`. */
  inject(message: Message): void {
    if (this.#status === "idle" || this.#status === "paused") {
      this.send(message)
    } else {
      this.#injectQueue.push(message)
    }
  }

  // ── Loop control ─────────────────────────────────────────────────────

  /** Drive steps until the session goes idle (no queued messages and
   *  the model stopped naturally) or hits a non-recoverable stop.
   *  Doubles as a resume from `paused` — drains queued messages and
   *  picks the loop back up. If a run is already in flight, returns
   *  the existing promise. */
  run(): Promise<AgentStopReason> {
    if (this.#runPromise) return this.#runPromise
    this.#pauseRequested = false
    this.#lastError = undefined
    this.#runPromise = this.#loop().finally(() => {
      this.#runPromise = undefined
    })
    return this.#runPromise
  }

  async #collect() {
    this.#abortController = new AbortController()
    const stream = this.#opts.model.stream({
      ...this.#opts.request,
      messages: this.#messages,
      prompt: this.prompt,
      signal: this.#abortController.signal,
    })
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
      for (const m of this.#injectQueue.splice(0)) this.add(m)
    }

    this.#setStatus("streaming")

    let collected
    try {
      collected = await this.#collect()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
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
        usageInput: collected.usage.input + (collected.usage.cachedInput ?? 0),
      })
    )
      return { kind: "context-overflow", ...result }

    this.add(collected.message)

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
    const resultParts: ToolResultPart[] = []
    for (const call of calls) {
      this.emit({ call, type: "tool-call" })
      const tool = this.#toolIndex.get(call.name)
      const result = tool ? await runTool(tool, call.params) : unknownToolResult(call.name)
      this.emit({ call, result, type: "tool-result" })
      resultParts.push({
        id: call.id,
        isError: result.isError,
        name: call.name,
        result: result.result,
        type: "tool-result",
      })
    }
    const message: Extract<Message, { role: "tool" }> = { content: resultParts, role: "tool" }
    this.add(message)
    return message
  }

  /** Pause after the current step completes. The loop exits with
   *  `stopReason: "paused"`; queued messages are preserved. */
  pause(): void {
    this.#pauseRequested = true
  }

  /** Abort the in-flight stream immediately. The session lands in
   *  `paused` with `lastError` set to an AbortError. */
  abort(): void {
    this.#abortController?.abort()
  }

  // ── Persistence ──────────────────────────────────────────────────────

  serialize(): SessionSnapshot {
    return {
      lastError: this.#lastError
        ? { message: this.#lastError.message, name: this.#lastError.name }
        : undefined,
      lastStopReason: this.#lastStopReason,
      messages: [...this.#messages],
      usage: { ...this.usage },
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  async #loop(): Promise<AgentStopReason> {
    // Reset per-run counters (steps, consecutive errors, call history).
    // Token totals stay sticky across resets — they're billing-style
    // displays, not per-turn caps.
    this.#policy.reset()

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
          for (const m of this.#sendQueue.splice(0)) this.add(m)
          continue
        }
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
      const stop = this.#policy.detect()
      if (stop) return this.#stop(stop)
    }
  }

  #stop(reason: AgentStopReason): AgentStopReason {
    this.#lastStopReason = reason
    this.#setStatus(reason === "natural" ? "idle" : "paused")
    this.emit({ reason, type: "stop", usage: this.usage })
    return reason
  }

  #setStatus(status: AgentStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.emit({ status, type: "status" })
  }
}
