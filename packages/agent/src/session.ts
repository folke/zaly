import type { FinishReason, Message, Usage } from "@zaly/ai"
import type { WriteStream } from "node:fs"

import { createWriteStream } from "node:fs"
import { readFile } from "node:fs/promises"
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
  | ({ type: "message"; message: Message } & MessageMeta)
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

/** Optional per-message metadata. Populated for assistant nodes the
 *  agent commits after a step (carrying model + usage + finish info);
 *  unset for user / tool messages or anything added directly. */
export interface MessageMeta {
  /** Model id that produced this message, when known. Lets readers
   *  attribute cost / detect model swaps without separate records. */
  modelId?: string
  /** Token usage from the step that produced this message. */
  usage?: Usage
  /** Provider-side finish reason for the step. */
  finishReason?: FinishReason
}

// ── Events ───────────────────────────────────────────────────────────────

/** Events a `Session` emits when its state changes. Subscribers fire
 *  synchronously; throws are routed to `onEmitError`. */
export type SessionEvent =
  | { type: "node"; node: SessionNode }
  | { type: "navigate"; head: string | undefined; messages: readonly Message[] }

// ── Session ──────────────────────────────────────────────────────────────

export interface SessionOptions {
  /** JSONL file to persist the session to. Each `node` event appends
   *  one record. Open in append mode — existing content is preserved.
   *  Use `Session.load(path)` to rehydrate from an existing file. */
  path?: string
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
 * - **Persistor** writes every `node` to the JSONL `path` if supplied.
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
  #writer?: WriteStream

  constructor(opts: SessionOptions = {}) {
    super()
    if (opts.path) this.#writer = createWriteStream(opts.path, { flags: "a" })

    // Always seed with a `session-start` node so the file (and the
    // navigation chain) always has a root.
    this.#commit({
      modelId: opts.modelId,
      prompt: opts.prompt,
      ts: Date.now(),
      type: "session-start",
      uuid: uuidv7(),
    })
    for (const m of opts.initialMessages ?? []) this.add(m)
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

  /** Append a message. The new node is parented to the current head,
   *  head advances, and a `node` event fires. Optional `meta` carries
   *  usage / model / finish info — populate it for assistant turns
   *  the agent commits after a step. Returns the assigned uuid. */
  add(message: Message, meta?: MessageMeta): string {
    return this.#commit({
      message,
      parentUuid: this.#head,
      ts: Date.now(),
      type: "message",
      uuid: uuidv7(),
      ...meta,
    })
  }

  /** Mark a compaction boundary. Subsequent `add()` calls land after
   *  this node; their messages form the new active conversation. The
   *  pre-compact chain stays in `nodes` but is no longer part of
   *  `messages`. Returns the compact node's uuid. */
  compact(
    opts: { trigger?: "manual" | "auto"; preTokens?: number; durationMs?: number } = {}
  ): string {
    return this.#commit({
      durationMs: opts.durationMs,
      parentUuid: this.#head,
      preTokens: opts.preTokens,
      trigger: opts.trigger ?? "manual",
      ts: Date.now(),
      type: "compact",
      uuid: uuidv7(),
    })
  }

  /** Move the head to a known node and rebuild `messages` from its
   *  chain. Throws if the uuid isn't in `nodes`. Use `undefined` to
   *  return to the root (`session-start`). */
  navigate(uuid: string | undefined): void {
    if (uuid !== undefined && !this.#nodes.has(uuid)) {
      throw new Error(`Session.navigate: unknown uuid "${uuid}"`)
    }
    this.#head = uuid
    this.#messages = this.#chain(uuid, { active: true })
    this.emit({ head: uuid, messages: this.#messages, type: "navigate" })
  }

  /** Pre-active history of the current chain — messages from before
   *  the most recent compact (and earlier compacts), in chronological
   *  order. Useful for TUI scrollback that wants to render context the
   *  agent itself no longer sees.
   *
   *  `limit` truncates from the front (oldest), so the most recent
   *  history messages always make it through. */
  history(limit?: number): Message[] {
    return this.#chain(this.#head, { active: false, limit })
  }

  /** Flush + close the JSONL writer if one is open. Subsequent writes
   *  throw. No-op for in-memory sessions. */
  async close(): Promise<void> {
    const writer = this.#writer
    if (!writer) return
    this.#writer = undefined
    await new Promise<void>((resolve, reject) => {
      writer.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
    })
  }

  // ── Persistence ──────────────────────────────────────────────────────

  /** Rehydrate a session from a JSONL file. Tolerant of a truncated
   *  last line (crash mid-write). The reconstructed session continues
   *  appending to the same file unless `append: false` is passed.
   *
   *  `fromUuid` selects the head — useful for branch-checkout. Defaults
   *  to the latest record in the file (file order). */
  static async load(
    path: string,
    opts: { fromUuid?: string; append?: boolean } = {}
  ): Promise<Session> {
    const text = await readFile(path, "utf8").catch((error) => {
      throw new Error(`Session.load: cannot read "${path}": ${(error as Error).message}`, {
        cause: error,
      })
    })
    const lines = text.split("\n")
    const records: SessionNode[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.length === 0) continue
      try {
        records.push(JSON.parse(line) as SessionNode)
      } catch (error) {
        // A truncated last line on crash is expected — tolerate it.
        // Anything else is a real corruption signal.
        if (i === lines.length - 1) continue
        throw new Error(
          `Session.load: malformed JSON at line ${i + 1}: ${(error as Error).message}`,
          { cause: error }
        )
      }
    }
    if (records.length === 0) {
      throw new Error(`Session.load: no records found in "${path}"`)
    }

    // Build empty session in-memory (no writer yet — we don't want to
    // re-write the records we're loading), then replace state.
    const session = new Session()
    session.#nodes.clear()
    session.#head = undefined
    session.#messages = []
    for (const node of records) session.#nodes.set(node.uuid, node)

    const head = opts.fromUuid ?? records[records.length - 1].uuid
    if (!session.#nodes.has(head)) {
      throw new Error(`Session.load: fromUuid "${head}" not in file "${path}"`)
    }
    session.#head = head
    session.#messages = session.#chain(head, { active: true })

    if (opts.append !== false) {
      session.#writer = createWriteStream(path, { flags: "a" })
    }
    return session
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Atomically commit a node: register it in the DAG, advance the
   *  head, update active messages, persist to disk if a writer is
   *  attached, and emit. Single chokepoint for all mutations. */
  #commit(node: SessionNode): string {
    this.#nodes.set(node.uuid, node)
    this.#head = node.uuid
    if (node.type === "message") this.#messages.push(node.message)
    else if (node.type === "compact") this.#messages = []
    this.#writer?.write(`${JSON.stringify(node)}\n`)
    this.emit({ node, type: "node" })
    return node.uuid
  }

  /** Walk `parentUuid` from the given node back toward the root,
   *  collecting message-node messages. The `active` flag controls
   *  what counts:
   *    - `true`      — only the active chain (stops at first compact /
   *                    session-start). Drives the `messages` getter.
   *    - `false`     — only the *historical* portion (skips messages
   *                    before crossing a compact / session-start, then
   *                    collects everything older). Drives `history()`.
   *    - `undefined` — collect everything across boundaries. Useful
   *                    for tools that want a full ancestral chain
   *                    regardless of compaction.
   *  Returns chronological order. */
  #chain(uuid: string | undefined, opts: { active?: boolean; limit?: number } = {}): Message[] {
    const out: Message[] = []
    let cursor = uuid
    let pastBoundary = false
    while (cursor) {
      const node = this.#nodes.get(cursor)
      if (!node) break
      if (node.type === "compact" || node.type === "session-start") {
        if (opts.active === true) break
        pastBoundary = true
        cursor = node.parentUuid
        continue
      }
      // node.type === "message"
      if (opts.active !== false || pastBoundary) out.push(node.message)
      if (opts.limit !== undefined && out.length >= opts.limit) break
      cursor = node.parentUuid
    }
    return out.toReversed()
  }
}
