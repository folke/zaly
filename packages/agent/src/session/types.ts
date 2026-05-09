import type { Message } from "@zaly/ai"
import type { SessionStore } from "./store.ts"

// ── Records ──────────────────────────────────────────────────────────────

/** A single node in the session DAG. Same shape on disk (JSONL) as in
 *  memory — what we persist *is* what we navigate. Meta lives ONLY on
 *  `session-meta` nodes as a full snapshot of the cumulative session
 *  meta at that point. Other node types are pure markers / payload —
 *  consumers reading "the meta as of node X" use `SessionNodeView`,
 *  which decorates raw nodes with cumulative meta computed by `Session`'s
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
  | { type: "session-meta"; meta: PersistedMeta }
  | { type: "message"; message: Message }
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

export type SessionMessage = Message & { ts: number; id: string }

export type SessionNode<T extends SessionNodeType = SessionNodeType> = Extract<
  SessionN,
  { type: T }
>

/** A `SessionNode` decorated with the cumulative meta as of that
 *  node's position in the chain. Returned by `Session.node()` and
 *  `Session#chain` — consumers always see a defined `meta`. */
export type SessionNodeView = SessionNode & { meta: PersistedMeta }

export type SessionView = {
  messages: Message[]
  nodes: Map<string, SessionNodeView>
  meta: PersistedMeta
  compact?: SessionNode<"compact">
}

export type InternalMeta = {
  version?: number
  sessionId?: string
}
export type PersistedMeta = InternalMeta & SessionMeta

/** Wire format == the in-memory shape. Storage backends round-trip
 *  `SessionNode` directly. Kept as an alias for legacy clarity / future
 *  divergence room. */
export type PersistedNode = SessionNode

export type SessionMeta = {
  cwd?: string
  modelId?: string
  prompt?: string[]
}

// ── Events ───────────────────────────────────────────────────────────────

/** Events a `Session` emits when its state changes. Subscribers fire
 *  synchronously; throws are routed to `onEmitError`. */
export type SessionEvents = {
  node: { node: SessionNode }
  navigate: { head: string | undefined; messages: readonly Message[] }
  compact: { node: SessionNode<"compact"> }
  cwd: { cwd: string }
  meta: { meta: SessionMeta; prev: SessionMeta; changes: Partial<Omit<SessionMeta, "cwd">> }
  "session-start": {}
  "session-resume": {}
}

// ── Session ──────────────────────────────────────────────────────────────

export type SessionOptions<T extends SessionStore = SessionStore> = {
  id?: string
  cwd?: string
  store?: T
  /** JSONL file to persist the session to. If the file exists, its
   *  records are read into the DAG before any `add()` calls; either way
   *  the session opens it in append mode so subsequent commits land on
   *  disk in real time. Omit for in-memory sessions. */
  path?: string
  /** Per-session directory for artifacts produced during this session —
   *  bash command logs (when output exceeds the inline cap), subagent
   *  traces, cached attachments, and any other side-channel data tools
   *  need to write somewhere session-scoped.
   *
   *  Layout: this is a *sibling* of the session's JSONL file, not its
   *  parent. For a session with `path = <project>/<id>.jsonl`, the
   *  artifacts dir is `<project>/<id>/`. Tools place their data inside
   *  (e.g. `<dir>/bash-logs/<n>.log`). */
  dir?: string
}

export type SessionInit<T extends SessionStore = SessionStore> = SessionOptions & {
  /** Storage backend. Required — `Session.load()` picks the right
   *  store based on options; direct construction passes one explicitly. */
  store: T
  meta?: PersistedMeta
}
