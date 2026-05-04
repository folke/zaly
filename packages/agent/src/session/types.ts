import type { FinishReason, Message, Usage } from "@zaly/ai"
import type { WriteStream } from "node:fs"

// ── Records ──────────────────────────────────────────────────────────────

/** A single node in the session DAG. Same shape on disk (JSONL) as in
 *  memory — what we persist *is* what we navigate. */
export type SessionNode = {
  uuid: string
  /** Absent only on the very first node (`session-start`). */
  parentUuid?: string
  /** Wall-clock millisecond timestamp when the node was created. */
  ts: number
  meta: SessionMeta
} & (
  | { type: "session-start" }
  | { type: "session-resume" }
  | { type: "session-meta" }
  | ({ type: "message"; message: Message } & MessageMeta)
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

export type InternalMeta = {
  version?: number
  sessionId?: string
}
export type PersistedMeta = InternalMeta & SessionMeta

export type PersistedNode = Omit<SessionNode, "meta"> & {
  meta?: PersistedMeta
}

export type SessionMeta = {
  cwd?: string
  modelId?: string
  prompt?: string[]
}

/** Optional per-message metadata. Populated for assistant nodes the
 *  agent commits after a step (carrying model + usage + finish info);
 *  unset for user / tool messages or anything added directly. */
export interface MessageMeta {
  /** Token usage from the step that produced this message. */
  usage?: Usage
  /** Provider-side finish reason for the step. */
  finishReason?: FinishReason
}

// ── Events ───────────────────────────────────────────────────────────────

/** Events a `Session` emits when its state changes. Subscribers fire
 *  synchronously; throws are routed to `onEmitError`. */
export type SessionEvents = {
  node: { node: SessionNode }
  navigate: { head: string | undefined; messages: readonly Message[] }
  compact: { node: Extract<SessionNode, { type: "compact" }> }
  cwd: { cwd: string }
  meta: { meta: SessionMeta; changes: Partial<Omit<SessionMeta, "cwd">> }
}

// ── Session ──────────────────────────────────────────────────────────────

export type SessionOptions = {
  id?: string
  cwd?: string
  /** JSONL file to persist the session to. If the file exists, its
   *  records are read into the DAG before any `add()` calls; either way
   *  the session opens it in append mode so subsequent commits land on
   *  disk in real time. Omit for in-memory sessions. */
  path?: string
  /** Initial head uuid — typically the latest record from disk. Set
   *  this to navigate to a specific branch on load. Defaults to the
   *  last record in the file (file order). Ignored when `path` is
   *  unset or empty. */
  head?: string
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

export type SessionInit = SessionOptions & {
  nodes?: Map<string, SessionNode>
  meta?: PersistedMeta
  writer?: WriteStream
}
