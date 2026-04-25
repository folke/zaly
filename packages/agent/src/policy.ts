import type { TokenCount, ToolCallPart } from "@zaly/ai"
import type { AgentEvent, AgentStopReason, Emitter } from "./events.ts"
import { addUsage } from "./utils.ts"

/** Caps + heuristics that can end a run early. Wired into the
 *  `AgentSession` loop via a single `detect()` call after each step. */
export interface StopPolicyOptions {
  /** Hard ceiling on provider round-trips per `run()`. Default: 50. */
  maxSteps?: number
  /** Cumulative token cap across the whole `run()`
   *  (`totalUsage.input + totalUsage.output`). */
  tokenBudget?: number
  /** Bail after this many consecutive failing tool calls. A successful
   *  tool result resets the streak. */
  maxToolErrors?: number

  // ── Loop detection ──────────────────────────────────────────────────
  // Two cheap heuristics over the running tool-call history. Hash is
  // `name + JSON.stringify(params)`; property order matters (rare false
  // negative if the model alternates key order on the same logical call,
  // accepted in exchange for a much cheaper hash). Set either limit to
  // `Infinity` to disable that arm.

  /** Same `(name, params)` appearing N times in a row → loop. Catches
   *  the most common failure mode: re-calling `read_file` with the same
   *  path expecting different output. Default 3. */
  loopConsecutive?: number
  /** Bounded window for duplicate detection. Default 10. */
  loopWindow?: number
  /** Within the window, this many duplicates of one call → loop.
   *  Catches alternation patterns (`A B A B …`) the consecutive arm
   *  alone won't see. Default 4. */
  loopWindowRepeats?: number
}

/**
 * Subscribes to an `AgentEvent` stream, accumulates the bookkeeping
 * the loop needs to make stop-or-continue decisions, and exposes a
 * single `detect()` to consult after each step.
 *
 * Lives outside `AgentSession` so concerns separate cleanly:
 *   - the session owns conversation, queues, status, and loop control;
 *   - the policy owns counters and the rules that act on them.
 *
 * Wire it up via `attach(session)` (returns an unsubscribe), or feed
 * events manually with `handle(event)` for custom drivers.
 */
export class StopPolicy {
  readonly #opts: StopPolicyOptions

  #steps = 0
  #consecutiveErrors = 0
  #callHistory: ToolCallPart[] = []
  #usage: TokenCount = { input: 0, output: 0 }
  #totalUsage: TokenCount = { input: 0, output: 0 }

  constructor(opts: StopPolicyOptions = {}) {
    this.#opts = opts
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Token usage from the most recent step's response. */
  get usage(): TokenCount {
    return this.#usage
  }
  /** Cumulative token usage across every step in the current run. */
  get totalUsage(): TokenCount {
    return this.#totalUsage
  }
  get steps(): number {
    return this.#steps
  }
  get consecutiveErrors(): number {
    return this.#consecutiveErrors
  }
  /** Tool-call history fed to the loop detector. Read-only. */
  get callHistory(): readonly ToolCallPart[] {
    return this.#callHistory
  }

  // ── Wiring ────────────────────────────────────────────────────────────

  /** Subscribe to an emitter. Returns the unsubscribe function. */
  attach(emitter: Emitter): () => void {
    return emitter.on((event) => this.handle(event))
  }

  /** Feed a single event into the policy. Public so custom drivers
   *  can drive it without going through `attach`. */
  handle(event: AgentEvent): void {
    switch (event.type) {
      case "step-end": {
        this.#steps++
        break
      }
      case "tool-call": {
        this.#callHistory.push(event.call)
        break
      }
      case "tool-result": {
        this.#consecutiveErrors = event.result.isError ? this.#consecutiveErrors + 1 : 0
        break
      }
      case "stream-event": {
        if (event.event.type === "finish") {
          this.#usage = event.event.usage
          this.#totalUsage = addUsage(this.#totalUsage, event.event.usage)
        }
        break
      }
      // status / message / replace / stop — no policy state to update.
    }
  }

  /** Reset per-run counters. Token totals (`usage` / `totalUsage`)
   *  persist unless `keepUsage: false` is passed — billing-style
   *  displays usually want them sticky across resets. */
  reset(opts: { keepUsage?: boolean } = {}): void {
    this.#steps = 0
    this.#consecutiveErrors = 0
    this.#callHistory = []
    if (opts.keepUsage === false) {
      this.#usage = { input: 0, output: 0 }
      this.#totalUsage = { input: 0, output: 0 }
    }
  }

  /** Decide whether the loop should stop. Returns the stop reason or
   *  `undefined` to continue. Order matters — `loop-detected` wins
   *  over `max-tool-errors` if both fire, since a model in a tight
   *  loop is the more pressing thing to surface. */
  detect(): AgentStopReason | undefined {
    if (this.#opts.maxSteps !== undefined && this.#steps >= this.#opts.maxSteps) {
      return "max-steps"
    }
    if (this.#detectLoop()) {
      return "loop-detected"
    }
    if (
      this.#opts.maxToolErrors !== undefined &&
      this.#consecutiveErrors >= this.#opts.maxToolErrors
    ) {
      return "max-tool-errors"
    }
    if (
      this.#opts.tokenBudget !== undefined &&
      this.#totalUsage.input + this.#totalUsage.output > this.#opts.tokenBudget
    ) {
      return "token-budget"
    }
    return undefined
  }

  // ── Loop detection internals ─────────────────────────────────────────

  #detectLoop(): boolean {
    const calls = this.#callHistory
    if (calls.length === 0) return false

    const consecutive = this.#opts.loopConsecutive ?? 3
    if (Number.isFinite(consecutive) && calls.length >= consecutive) {
      const last = hashCall(calls[calls.length - 1])
      let run = 1
      for (let i = calls.length - 2; i >= 0 && run < consecutive; i--) {
        if (hashCall(calls[i]) === last) run++
        else break
      }
      if (run >= consecutive) return true
    }

    const window = this.#opts.loopWindow ?? 10
    const windowRepeats = this.#opts.loopWindowRepeats ?? 4
    if (Number.isFinite(windowRepeats) && calls.length >= windowRepeats) {
      const slice = calls.slice(Math.max(0, calls.length - window))
      const counts = new Map<string, number>()
      for (const call of slice) {
        const h = hashCall(call)
        const next = (counts.get(h) ?? 0) + 1
        if (next >= windowRepeats) return true
        counts.set(h, next)
      }
    }

    return false
  }
}

function hashCall(call: ToolCallPart): string {
  return `${call.name}\0${JSON.stringify(call.params)}`
}
