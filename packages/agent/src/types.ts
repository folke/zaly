import type {
  CollectOptions,
  FinishReason,
  Message,
  Model,
  StreamOptions,
  TokenCount,
  Tool,
} from "@zaly/ai"
import type { Agent } from "./agent.ts"
import type { StepKind } from "./events.ts"
import type { PermissionOptions } from "./permissions/index.ts"
import type { Session } from "./session.ts"
import type { StopOptions } from "./stop.ts"

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

/** Options for constructing an `Agent`. */
export interface AgentOptions extends CollectOptions {
  model: Model
  /** Tools the model may call. Kernel-owned: the agent both passes
   *  these to the provider on every step and dispatches calls against
   *  them. Mutable post-construction via `agent.tools = …`. */
  tools?: Tool[]
  /** Stop-policy knobs — `maxSteps`, `tokenBudget`, `maxToolErrors`,
   *  loop-detection tuning. Grouped under one key to keep the agent's
   *  top-level surface focused. Omit to use defaults (see `StopPolicy`). */
  stop?: StopOptions
  permissions?: PermissionOptions
  /** Per-call passthrough knobs (`temperature`, `toolChoice`,
   *  `reasoning`, `responseFormat`, …). The agent owns `model`,
   *  `messages`, `prompt`, and `tools` — those have dedicated
   *  top-level fields here. */
  request?: StreamOptions
  /** Pre-built `Session` to use. Useful for resuming a persisted
   *  conversation or for sharing one Session across multiple Agents
   *  (e.g. swapping models). When omitted, a fresh in-memory Session
   *  is created. Either way, `messages` (if any) are appended to it. */
  session?: Session
  /** Initial messages appended to the session at construction. Useful
   *  for seeding a fresh conversation or for prepending fixed context
   *  to an existing session. */
  messages?: Message[]
  /** Durable system prompt — passed to every step's request and
   *  routed by adapters to each provider's dedicated system slot. Use
   *  this for "behave like X" instructions that don't change across
   *  the session. For mid-conversation steering, `send()` a
   *  `role: "system"` message instead. Mutable via `agent.prompt = …`. */
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
