import type { FinishReason, Message, Usage } from "@zaly/ai"
import type { WriteStream } from "node:fs"

import { Emitter, normPath } from "@zaly/shared"
import { createWriteStream, existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { uuidv7 } from "../utils/uuid.ts"

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
export type SessionEvents = {
  node: { node: SessionNode }
  navigate: { head: string | undefined; messages: readonly Message[] }
}

// ── Session ──────────────────────────────────────────────────────────────

export interface SessionOptions {
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
}

/** Metadata recorded on the `session-start` node by `start()`. Captures
 *  the model and durable prompt that originally produced the
 *  conversation, so loaders / replay tools can attribute downstream
 *  records correctly even when a different Agent picks the session up
 *  later (e.g. for model swaps). */
export interface SessionStart {
  modelId?: string
  prompt?: string[]
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
 *
 * Construction:
 *   - Use `await Session.load(opts)` for the recommended path — handles
 *     reading existing records + opening the writer in append mode.
 *   - The constructor is `protected` so subclasses (test doubles) can
 *     still extend `Session`, but production code goes through `load`.
 */
export class Session extends Emitter<SessionEvents> {
  readonly #nodes = new Map<string, SessionNode>()
  #head?: string
  #messages: Message[] = []
  #writer?: WriteStream

  /** Synchronous, low-level constructor. Prefer `Session.load(opts)` —
   *  it runs the same construction *plus* file I/O (reading existing
   *  records and opening the writer in append mode). The constructor
   *  is `protected` so subclasses can still call `super()` directly. */
  protected constructor() {
    super()
  }

  /** Recommended one-step path: construct, optionally hydrate from
   *  `opts.path`, and open the writer for future appends. The returned
   *  session is fully operational. */
  static async load(opts: SessionOptions = {}): Promise<Session> {
    const session = new Session()
    if (opts.path !== undefined && opts.path !== "") {
      await session.#hydrate(opts.path, opts.head)
    }
    return session
  }

  /** Load existing records from `path` (when the file exists) and open
   *  the writer in append mode. New session-start / message / compact
   *  nodes will land on disk as they're committed. */
  async #hydrate(path: string, head?: string): Promise<void> {
    // Honor `~` and any relative-to-cwd shorthand the caller passed.
    path = normPath(path)
    if (existsSync(path)) {
      const text = await readFile(path, "utf8")
      const lines = text.split("\n")
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.length === 0) continue
        let record: SessionNode
        try {
          record = JSON.parse(line) as SessionNode
        } catch (error) {
          // Tolerate a truncated last line (crash mid-write); anything
          // else is real corruption.
          if (i === lines.length - 1) continue
          throw new Error(
            `Session.load: malformed JSON at line ${i + 1} of "${path}": ${(error as Error).message}`,
            { cause: error }
          )
        }
        // Patch id/ts onto loaded messages for older session files
        // that were written before Message.id/ts existed. Idempotent
        // for newer files (the fields already match the node).
        if (record.type === "message") {
          record.message.id ??= record.uuid
          record.message.ts ??= record.ts
        }
        this.#nodes.set(record.uuid, record)
      }
      // Choose the head: explicit > last-on-file > none.
      const last = [...this.#nodes.keys()].at(-1)
      const target = head ?? last
      if (head !== undefined && !this.#nodes.has(head)) {
        throw new Error(`Session.load: head "${head}" not in file "${path}"`)
      }
      this.#head = target
      this.#messages = this.#chain(target, { active: true }).map((c) => c.message)
    }
    // Open writer in append mode — creates the file on first write if
    // it didn't exist.
    this.#writer = createWriteStream(path, { flags: "a" })
  }

  /** Initialize the session by writing a `session-start` node. Called
   *  by `Agent`'s constructor in the common path; safe to call directly
   *  if you're using `Session` standalone.
   *
   *  Idempotent: if the session already has a `session-start` (because
   *  it was loaded from disk, pre-seeded, or a prior `start()` ran),
   *  this is a no-op. The original metadata stays intact — historical
   *  truth wins over later context. To make a model swap visible in the
   *  DAG, append a record yourself rather than overwriting the start. */
  start(meta: SessionStart = {}): void {
    if (this.#nodes.size > 0) return
    this.#commit({
      modelId: meta.modelId,
      prompt: meta.prompt,
      ts: Date.now(),
      type: "session-start",
      uuid: uuidv7(),
    })
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Active conversation — chain from current head back to the most
   *  recent compact (exclusive), in chronological order. This is what
   *  the agent sees on the next request. */
  get messages(): readonly Message[] {
    return this.#messages
  }

  /** Look up the full session node for a `Message.id`. Returns the
   *  message-typed node, or `undefined` if the id doesn't refer to a
   *  message in this session (unknown id, or id refers to a non-message
   *  node like `compact` / `session-start`). Useful when you have a
   *  Message in hand (e.g. inside the masker or a tool) and need the
   *  surrounding metadata — parent uuid, model id, usage, etc. */
  node(id?: string | Message): Extract<SessionNode, { type: "message" }> | undefined {
    const m = typeof id === "string" ? { id } : id
    const n = m?.id ? this.#nodes.get(m.id) : undefined
    return n?.type === "message" ? n : undefined
  }

  /** Current head uuid — the parent of the next added node. */
  get head(): string | undefined {
    return this.#head
  }

  /** Full DAG of nodes the session knows about. Read-only. */
  get nodes(): ReadonlyMap<string, SessionNode> {
    return this.#nodes
  }

  get root(): SessionNode | undefined {
    return this.#nodes.get(this.#head ?? "")
  }

  // ── Mutate ────────────────────────────────────────────────────────────

  /** Append a message. The new node is parented to the current head,
   *  head advances, and a `node` event fires. Optional `meta` carries
   *  usage / model / finish info — populate it for assistant turns
   *  the agent commits after a step. Returns the assigned uuid.
   *
   *  If `message.id` / `message.ts` are set (e.g. round-tripped from a
   *  prior load), they're used as the node's uuid / timestamp; otherwise
   *  fresh values are generated. The committed message always carries
   *  both — `m.id === node.uuid` and `m.ts === node.ts`. */
  add(message: Message, meta?: MessageMeta): string {
    const uuid = message.id ?? uuidv7()
    const ts = message.ts ?? Date.now()
    const m =
      message.id !== undefined && message.ts !== undefined ? message : { ...message, id: uuid, ts }
    return this.#commit({
      message: m,
      parentUuid: this.#head,
      ts,
      type: "message",
      uuid,
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
    this.#messages = this.#chain(uuid, { active: true }).map((c) => c.message)
    this.emit("navigate", { head: uuid, messages: this.#messages })
  }

  /** Pre-active history of the current chain — messages from before
   *  the most recent compact (and earlier compacts), in chronological
   *  order. Useful for TUI scrollback that wants to render context the
   *  agent itself no longer sees.
   *
   *  `limit` truncates from the front (oldest), so the most recent
   *  history messages always make it through. */
  history(limit?: number): Message[] {
    return this.#chain(this.#head, { active: false, limit }).map((c) => c.message)
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
    this.emit("node", { node })
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
  #chain(
    uuid: string | undefined,
    opts: { active?: boolean; limit?: number } = {}
  ): { uuid: string; ts: number; message: Message }[] {
    const out: { uuid: string; ts: number; message: Message }[] = []
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
      if (opts.active !== false || pastBoundary) {
        out.push({ message: node.message, ts: node.ts, uuid: node.uuid })
      }
      if (opts.limit !== undefined && out.length >= opts.limit) break
      cursor = node.parentUuid
    }
    return out.toReversed()
  }
}
