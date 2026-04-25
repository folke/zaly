import type { Message } from "@zaly/ai"
import { Emitter } from "./events.ts"
import { uuidv7 } from "./utils/uuid.ts"

// ── Records ──────────────────────────────────────────────────────────────

/** A single node in the session DAG. Same shape on disk (JSONL) as in
 *  memory — what we persist *is* what we navigate. */
export type SessionNode = {
  uuid: string
  /** Absent only on the very first node (`session-start`). */
  parentUuid?: string
  /** Wall-clock millisecond timestamp when the node was created. */
  ts: number
} & (
  | { type: "session-start"; modelId?: string; prompt?: string[] }
  | { type: "message"; message: Message }
  | {
      type: "compact"
      /** Whether the loop kicked off compaction itself or the user did. */
      trigger: "manual" | "auto"
      /** Last known cumulative input+output tokens at compaction time. */
      preTokens?: number
      /** How long the compactor took, ms. */
      durationMs?: number
    }
)

// ── Events ───────────────────────────────────────────────────────────────

/** Events a `Session` emits when its state changes. Subscribers fire
 *  synchronously; throws are routed to `onEmitError`. */
export type SessionEvent =
  | { type: "node"; node: SessionNode }
  | { type: "navigate"; head: string | undefined; messages: readonly Message[] }

// ── Session ──────────────────────────────────────────────────────────────

export interface SessionOptions {
  /** Conversation history to seed the session. Each message gets a
   *  fresh uuid; `parentUuid` chains them in order. */
  initialMessages?: Message[]
  /** Initial durable system prompt — recorded on the `session-start`
   *  node so loaders can recover it. The active value lives on the
   *  agent / context that wraps this session. */
  prompt?: string[]
  /** Model id active at session creation — recorded on the
   *  `session-start` node. */
  modelId?: string
}

/**
 * Conversation primitive. Owns a DAG of message + compaction nodes and
 * a head pointer; the *active* message list is whatever you get by
 * walking `parentUuid` backwards from the head until you hit a
 * `compact` node (or the start).
 *
 * Designed so the loop, the persistor, the TUI, and any replay tool
 * all read from one source of truth and never mutate the DAG behind
 * each other's backs:
 *
 * - **Run loop** (`Agent`) calls `add()` on each new message and
 *   `compact()` on overflow.
 * - **TUI** subscribes to the `node` event for streaming render and to
 *   `navigate` for tree-checkout style refresh.
 * - **Persistor** (later: file path on construction) appends every
 *   emitted node as a JSONL record.
 * - **`/tree` UI** reads `nodes` for the full DAG and calls
 *   `navigate(uuid)` to switch heads.
 *
 * Branching, rewind, and replay all collapse to "set head." Nothing in
 * the format is destructive — old messages stay as orphan branches.
 */
export class Session extends Emitter<SessionEvent> {
  readonly #nodes = new Map<string, SessionNode>()
  #head?: string
  #messages: Message[] = []

  constructor(opts: SessionOptions = {}) {
    super()
    // Always seed with a `session-start` node so the file (and the
    // navigation chain) always has a root. Even an in-memory session
    // benefits — the root is the canonical "before any messages"
    // anchor for navigate(undefined) → reset.
    const start: SessionNode = {
      modelId: opts.modelId,
      prompt: opts.prompt,
      ts: Date.now(),
      type: "session-start",
      uuid: uuidv7(),
    }
    this.#nodes.set(start.uuid, start)
    this.#head = start.uuid
    this.emit({ node: start, type: "node" })

    if (opts.initialMessages?.length) this.add(...opts.initialMessages)
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Active conversation — chain from current head back to the most
   *  recent compact (exclusive), in chronological order. This is what
   *  the agent sees on the next request. */
  get messages(): readonly Message[] {
    return this.#messages
  }

  /** Current head uuid — the parent of the next added node. */
  get head(): string | undefined {
    return this.#head
  }

  /** Full DAG of nodes the session knows about. Read-only. */
  get nodes(): ReadonlyMap<string, SessionNode> {
    return this.#nodes
  }

  // ── Mutate ────────────────────────────────────────────────────────────

  /** Append one or more messages. Each is recorded as a `message`
   *  node parented to the current head; head advances per message,
   *  and `node` events fire in order. Returns the assigned uuids. */
  add(...messages: Message[]): string[] {
    const uuids: string[] = []
    for (const message of messages) {
      const node: SessionNode = {
        message,
        parentUuid: this.#head,
        ts: Date.now(),
        type: "message",
        uuid: uuidv7(),
      }
      this.#nodes.set(node.uuid, node)
      this.#head = node.uuid
      this.#messages.push(message)
      uuids.push(node.uuid)
      this.emit({ node, type: "node" })
    }
    return uuids
  }

  /** Mark a compaction boundary. Subsequent `add()` calls land after
   *  this node; their messages form the new active conversation. The
   *  pre-compact chain stays in `nodes` but is no longer part of
   *  `messages`. Returns the compact node's uuid. */
  compact(opts: { trigger?: "manual" | "auto"; preTokens?: number; durationMs?: number } = {}): string {
    const node: SessionNode = {
      durationMs: opts.durationMs,
      parentUuid: this.#head,
      preTokens: opts.preTokens,
      trigger: opts.trigger ?? "manual",
      ts: Date.now(),
      type: "compact",
      uuid: uuidv7(),
    }
    this.#nodes.set(node.uuid, node)
    this.#head = node.uuid
    this.#messages = []
    this.emit({ node, type: "node" })
    return node.uuid
  }

  /** Move the head to a known node and rebuild `messages` from its
   *  chain. Throws if the uuid isn't in `nodes`. Use `undefined` to
   *  return to the root (`session-start`). */
  navigate(uuid: string | undefined): void {
    if (uuid !== undefined && !this.#nodes.has(uuid)) {
      throw new Error(`Session.navigate: unknown uuid "${uuid}"`)
    }
    this.#head = uuid
    this.#messages = this.#chainFrom(uuid)
    this.emit({ head: uuid, messages: this.#messages, type: "navigate" })
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Walk `parentUuid` from the given node back toward the root,
   *  collecting message-node messages. Stops at the first `compact`
   *  (exclusive) or `session-start`. Returns chronological order. */
  #chainFrom(uuid: string | undefined): Message[] {
    const out: Message[] = []
    let cursor = uuid
    while (cursor) {
      const node = this.#nodes.get(cursor)
      if (!node) break
      if (node.type === "compact" || node.type === "session-start") break
      out.push(node.message)
      cursor = node.parentUuid
    }
    return out.toReversed()
  }
}
