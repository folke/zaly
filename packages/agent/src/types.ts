import type {
  CollectOptions,
  FinishReason,
  GenerateRequest,
  Message,
  Model,
  TokenCount,
} from "@zaly/ai"
import type { Agent } from "./agent.ts"
import type { StepKind } from "./events.ts"
import type { StopPolicyOptions } from "./policy.ts"
import type { Session } from "./session.ts"

/** Outcome of a single step (one provider round-trip + tool batch).
 *  Returned from `step()` so custom drivers can interleave their own
 *  logic between steps. */
export interface StepResult {
  kind: StepKind
  message?: Message<"assistant">
  toolMessage?: Message<"tool">
  finishReason: FinishReason
  usage: TokenCount
  error?: Error
}

/** Options for constructing an `Agent`. Inherits all stop-policy
 *  knobs (`maxSteps`, `tokenBudget`, `maxToolErrors`, loop-detection
 *  tuning) from `StopPolicyOptions`. */
export interface AgentOptions extends CollectOptions, StopPolicyOptions {
  model: Model
  /** Static per-call request knobs (tools, temperature, reasoning,
   *  toolChoice, …). The agent owns `model`, `messages`, and
   *  `prompt` — those have dedicated top-level fields here. */
  request?: Omit<GenerateRequest, "model" | "messages" | "prompt">
  /** Pre-built `Session` to use. Useful for resuming a persisted
   *  conversation or for sharing one Session across multiple Agents
   *  (e.g. swapping models). When omitted, a fresh in-memory Session
   *  is created from `initialMessages` / `prompt` / `model.id`. */
  session?: Session
  /** Conversation history to seed a new Session with. Ignored if
   *  `session` is supplied. */
  initialMessages?: Message[]
  /** Durable system prompt — passed to every step's request and
   *  routed by adapters to each provider's dedicated system slot. Use
   *  this for "behave like X" instructions that don't change across
   *  the session. For mid-conversation steering, `send()` a
   *  `role: "system"` message instead. */
  prompt?: string[]
  /** Model's declared context window — enables silent-overflow detection. */
  contextLimit?: number

  // ── Recovery ───────────────────────────────────────────────────────
  /** Called when a step returns `context-overflow`. Should mutate the
   *  session (via `agent.session.compact()` after producing a summary)
   *  to fit within the context window. After it resolves the loop
   *  retries from the compacted state. If absent, overflow stops the
   *  loop. */
  compact?: (agent: Agent) => void | Promise<void>
}
