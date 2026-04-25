import type {
  CollectOptions,
  FinishReason,
  GenerateRequest,
  Message,
  Model,
  TokenCount,
} from "@zaly/ai"
import type { AgentSession } from "./agent.ts"
import type { AgentStopReason, StepKind } from "./events.ts"
import type { StopPolicyOptions } from "./policy.ts"

/** Outcome of a single step (one provider round-trip + tool batch).
 *  Returned from `step()` so custom drivers can interleave their own
 *  logic between steps. */
export interface StepResult {
  kind: StepKind
  message?: Extract<Message, { role: "assistant" }>
  toolMessage?: Extract<Message, { role: "tool" }>
  finishReason: FinishReason
  usage: TokenCount
  error?: Error
}

/** Snapshot returned from `serialize()`. Sufficient to reconstruct an
 *  AgentSession's conversation + accumulated usage; transient state
 *  (queues, in-flight stream) is intentionally omitted. */
export interface SessionSnapshot {
  messages: Message[]
  usage: TokenCount
  lastStopReason?: AgentStopReason
  lastError?: { message: string; name: string }
}

/** Options for constructing an AgentSession. Inherits all stop-policy
 *  knobs (`maxSteps`, `tokenBudget`, `maxToolErrors`, loop-detection
 *  tuning) from `StopPolicyOptions`. */
export interface AgentSessionOptions extends CollectOptions, StopPolicyOptions {
  model: Model
  /** Static per-call request knobs (tools, temperature, reasoning,
   *  toolChoice, …). The session owns `model`, `messages`, and
   *  `prompt` — those have dedicated top-level fields here. */
  request?: Omit<GenerateRequest, "model" | "messages" | "prompt">
  /** Conversation history to start with. Often empty; messages are
   *  added via `send()`. */
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
  /** Called when a step returns `context-overflow`. Should mutate
   *  the session (typically via `replace()`) to fit within the
   *  context window. After it resolves the loop retries from the
   *  compacted state. If absent, overflow stops the loop. */
  compact?: (session: AgentSession) => void | Promise<void>
}
