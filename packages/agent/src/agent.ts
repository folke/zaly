// oxlint-disable no-await-in-loop
import type { Message, Tool, ToolCallPart, ToolResultPart } from "@zaly/ai"
import type { AgentEvent, AgentStatus, AgentStopReason } from "./events.ts"
import type { PermissionPolicy } from "./permissions/index.ts"
import type { AgentOptions, StepResult } from "./types.ts"

import { collect, isContextOverflow, runTool } from "@zaly/ai"
import { toError } from "@zaly/shared"
import { Emitter } from "./events.ts"
import { definePermissions } from "./permissions/index.ts"
import { Session } from "./session.ts"
import { StopPolicy } from "./stop.ts"
import { extractToolCalls, unknownToolResult } from "./utils/index.ts"

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
  readonly #permissions: PermissionPolicy
  readonly session: Session

  #tools: Tool[] = []
  #prompt?: string[]

  #injectQueue: Message[] = []
  #sendQueue: Message[] = []

  #status: AgentStatus = "idle"
  #abortController?: AbortController
  #pauseRequested = false
  #runPromise?: Promise<AgentStopReason>

  #lastError?: Error
  #lastStopReason?: AgentStopReason

  constructor(opts: AgentOptions) {
    super()
    this.#opts = opts
    this.#prompt = opts.prompt
    this.session = opts.session ?? new Session()
    // Idempotent — no-op on a loaded / pre-seeded session, so historical
    // metadata wins over whatever this Agent would record now.
    this.session.start({ modelId: opts.model.id, prompt: this.#prompt })
    for (const m of opts.messages ?? []) this.session.add(m)
    this.tools = opts.tools ?? []
    this.#stopPolicy = new StopPolicy(opts.stop)
    this.#stopPolicy.attach(this)
    this.#permissions = definePermissions(opts.permissions)
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
   *  Setting rebuilds the dispatch table. */
  get tools(): readonly Tool[] {
    return this.#tools
  }
  set tools(next: Tool[]) {
    this.#tools = next
  }

  get permissions(): PermissionPolicy {
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

  // ── Loop control ─────────────────────────────────────────────────────

  /** Drive steps until the agent goes idle (no queued messages and
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
    const stream = this.#opts.model.stream(
      {
        messages: [...this.session.messages],
        prompt: this.#prompt,
        tools: this.#tools,
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
    const resultParts: ToolResultPart[] = []
    for (const call of calls) {
      this.emit({ call, type: "tool-call" })
      const tool = this.#tools.find((t) => t.name === call.name)
      const result = tool ? await runTool(tool, call.params) : unknownToolResult(call.name)
      this.emit({ call, result, type: "tool-result" })
      resultParts.push({
        content: result.content,
        error: result.error,
        id: call.id,
        isError: result.isError,
        name: call.name,
        type: "tool-result",
      })
    }
    const message: Message<"tool"> = { content: resultParts, role: "tool" }
    this.session.add(message)
    return message
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

  #setStatus(status: AgentStatus): void {
    if (this.#status === status) return
    this.#status = status
    this.emit({ status, type: "status" })
  }
}
