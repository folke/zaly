import type { Message, ReasoningEffort } from "@zaly/ai"
import type { SessionStore } from "./store.ts"

// ── Records ──────────────────────────────────────────────────────────────

/** A single node in the session DAG. Same shape on disk (JSONL) as in
 *  memory — what we persist *is* what we navigate. Session settings live ONLY on
 *  `session-settings` nodes as a full snapshot of the cumulative session
 *  settings at that point. Other node types are pure markers / payload —
 *  consumers reading "the settings as of node X" use `SessionNodeView`,
 *  which decorates raw nodes with cumulative settings computed by `Session`'s
 *  chain-walk forward pass. */
type SessionN = {
  uuid: string
  /** Absent only on the very first node (`session-start`). */
  parentUuid?: string
  /** Wall-clock millisecond timestamp when the node was created. */
  ts: number
} & (
  | { type: "session-start" }
  | { type: "session-resume" }
  | { type: "session-settings"; settings: SessionSettings }
  | { type: "message"; message: Message }
  | { type: "mask-checkpoint"; threshold: number; messageId: string }
  | {
      type: "compact"
      /** Whether the loop kicked off compaction itself or the user did. */
      trigger: "manual" | "auto"
      /** Last known cumulative input+output tokens at compaction time. */
      preTokens?: number
      /** How long the compactor took, ms. */
      durationMs?: number
      /** Number of message from before compaction that will be preserved */
      tail: number
      /** Frozen summary message that becomes the head of the active
       *  chain reconstruction. The full Message (not just text) so the
       *  walker stays generic and future format changes don't require
       *  migrating old compact nodes. */
      summary: Message<"system">
    }
)
type SessionNodeType = SessionN["type"]

export type MaskCheckpoint = { messageId: string; threshold: number }

export type SessionMessage = Message & { ts: number; id: string }

export type SessionNode<T extends SessionNodeType = SessionNodeType> = Extract<
  SessionN,
  { type: T }
>

/** A `SessionNode` decorated with the cumulative settings as of that
 *  node's position in the chain. Returned by `Session.node()` and
 *  `Session#chain` — consumers always see a defined `settings`. */
export type SessionNodeView = SessionNode & { settings: SessionSettings }

export type SessionView = {
  messages: Message[]
  nodes: Map<string, SessionNodeView>
  compact?: SessionNode<"compact">
  maskCheckpoint?: MaskCheckpoint
}

export type SessionSettings = {
  version?: number
  sessionId?: string
  cwd?: string
  workspace?: string
  modelId?: string
  reasoning?: ReasoningEffort
}

export type SessionUpdate = Omit<SessionSettings, "version" | "sessionId">

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type PartialNode = DistributiveOmit<SessionNode, "parentUuid" | "uuid" | "ts">

// ── Events ───────────────────────────────────────────────────────────────

/** Events a `Session` emits when its state changes. Subscribers fire
 *  synchronously; throws are routed to `onEmitError`. */
export type SessionEvents = {
  node: { node: SessionNode }
  navigate: { head: string | undefined; messages: readonly Message[] }
  compact: { node: SessionNode<"compact"> }

  cwd: { cwd: string; prev?: string }
  model: { model: string; prev?: string }
  reasoning: { effort: ReasoningEffort; prev?: ReasoningEffort }

  "session-start": {}
  "session-resume": {}
}

// ── Session ──────────────────────────────────────────────────────────────

export type SessionOptions<T extends SessionStore = SessionStore> = {
  store?: T
  /** JSONL file to persist the session to. If the file exists, its
   *  records are read into the DAG before any `add()` calls; either way
   *  the session opens it in append mode so subsequent commits land on
   *  disk in real time. Omit for in-memory sessions. */
  path?: string
  /** Per-session directory for artifacts produced during this session —
   *  bash command logs (when output exceeds the inline cap), subagent
   *  traces, cached attachments, and any other side-channel data tools
   *  need to write somewhere session-scoped. */
  dir?: string
  /** Initial session settings. Only used to fill in missing fields in the
   * session's first `session-settings` node; */
  defaults?: Omit<SessionSettings, "version">
}

export type SessionInit<T extends SessionStore = SessionStore> = SessionOptions & {
  /** Storage backend. Required — `Session.load()` picks the right
   *  store based on options; direct construction passes one explicitly. */
  store: T
}
