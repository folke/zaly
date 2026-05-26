import type { Message, StreamEvent, TokenCount, Tool, ToolCallPart, ToolResult } from "@zaly/ai"

// ── Agent event map ──────────────────────────────────────────────────────

/** Status of an agent session — at most one transition per moment.
 *  `paused` covers both explicit pause and post-error states; the
 *  `lastError` field on the session disambiguates. */
export type AgentStatus = "idle" | "streaming" | "running-tools" | "compacting" | "paused"

/** Reason the loop stopped this turn. Distinct from the provider's
 *  `finishReason` (which describes why one round-trip ended). */
export type AgentStopKind =
  | "natural"
  | "max-steps"
  | "token-budget"
  | "loop-detected"
  | "max-tool-errors"
  | "context-overflow"
  | "paused"
  | "aborted"
  | "error"

/** Outcome kind of a single step (one provider round-trip + tool batch).
 *  Returned from `step()` so custom drivers can interleave their own
 *  logic between steps. */
export type StepKind = "natural" | "tool-calls" | "context-overflow" | "error"

export type AgentStop = {
  kind: AgentStopKind
  reason?: string // human-readable; pulled from lastError.message or pauseRequested
  error?: Error // present when kind is aborted/error
}

/** Events emitted by an `Agent` as the loop runs. Listeners fire
 *  synchronously; a throw inside a listener is caught and routed to
 *  `onEmitError` so the loop keeps running.
 *
 *  Conversation-shape events (new message committed, head moved, …)
 *  live on the `Session`, not here — subscribe via `agent.session.on(…)`. */
export type AgentEvents = {
  status: { status: AgentStatus }
  start: {}
  "stream-event": { event: StreamEvent }
  "tool-call": { call: ToolCallPart }
  "tool-calls": { calls: ToolCallPart[] }
  "tool-result": { call: ToolCallPart; result: ToolResult }
  "step-start": { step: number }
  "step-end": { step: number; outcome: StepKind }
  "turn-start": { turn: number }
  "turn-end": { turn: number; outcome: AgentStopKind; reason?: string }
  stop: AgentStop & {
    usage: TokenCount
    status: AgentStatus
  }
  context: { prompt: string[]; tools: Tool[]; messages: Message[] }
}
