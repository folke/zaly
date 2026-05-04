import type { Message } from "@zaly/ai"
import type { WriteStream } from "node:fs"
import type {
  InternalMeta,
  MessageMeta,
  PersistedMeta,
  PersistedNode,
  SessionEvents,
  SessionInit,
  SessionMeta,
  SessionNode,
  SessionOptions,
} from "./types.ts"

import { Emitter, normPath, safeReadFile, safeStringify } from "@zaly/shared"
import { createWriteStream } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { join } from "pathe"
import { zalyPaths } from "../utils/paths.ts"
import { uuidv7 } from "../utils/uuid.ts"

const VERSION = 1

function migrate(node: SessionNode, meta: PersistedMeta): SessionNode {
  const version = meta.version
  if (version === VERSION) return node

  if (version === 0) {
    if (node.type === "message" || node.type === "session-start") {
      const modelId = (node as unknown as { modelId?: string }).modelId
      meta.modelId = modelId ?? meta.modelId
    }
    if (node.type === "message") {
      // Patch id/ts onto loaded messages for older session files that
      // were written before Message.id/ts existed. Idempotent for newer
      // files (the fields already match the node).
      node.message.id ??= node.uuid
      node.message.ts ??= node.ts
    }
  }
  return node
}

function splitMeta(meta: PersistedMeta): { internal: InternalMeta; session: SessionMeta } {
  const { version, sessionId, ...session } = meta
  const internal: InternalMeta = { sessionId, version }
  return { internal, session }
}

function diffMeta(oldMeta: PersistedMeta, newMeta: PersistedMeta) {
  const diff = Object.entries(newMeta).filter(
    ([k, v]) => !isDeepStrictEqual(v, oldMeta[k as keyof SessionMeta])
  )
  return {
    changes: diff.length,
    meta: Object.fromEntries(diff),
  }
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
  readonly #nodes: Map<string, SessionNode>
  #id: string
  #cwd: string
  #dir: string
  #path?: string
  #head?: string
  #messages: Message[] = []
  #writer?: WriteStream
  #closed = false
  #meta: PersistedMeta = {} // Persisted meta data
  #started = false

  /** Synchronous, low-level constructor. Prefer `Session.load(opts)` —
   *  it runs the same construction *plus* file I/O (reading existing
   *  records and opening the writer in append mode). The constructor
   *  is `protected` so subclasses can still call `super()` directly. */
  protected constructor(opts: SessionInit = {}) {
    super()
    this.#nodes = opts.nodes ?? new Map<string, SessionNode>()
    this.#meta = opts.meta ?? {}
    this.#writer = opts.writer
    this.#id = opts.id ?? uuidv7()
    this.#cwd = normPath(opts.cwd ?? process.cwd())
    this.#dir = normPath(opts.dir ?? join(zalyPaths.tmp, "sessions"))
    this.#path = opts.path ? normPath(opts.path) : undefined
    this.#head = opts.head ?? [...this.#nodes.keys()].at(-1)
    if (this.#head !== undefined && !this.#nodes.has(this.#head))
      throw new Error(`Session: head "${this.#head}" not in file "${this.#path}"`)
    this.#rebuild()
  }

  #rebuild() {
    this.#messages = this.#chain(this.#head, { active: true }).map((c) => c.message)
  }

  /** Recommended one-step path: construct, optionally hydrate from
   *  `opts.path`, and open the writer for future appends. The returned
   *  session is fully operational. */
  static async load(opts: SessionOptions = {}): Promise<Session> {
    let init: Partial<SessionInit> = { ...opts, path: undefined }
    if (opts.path && typeof opts.path === "string") {
      const hydrated = await Session.#hydrate(opts.path)
      init = { ...hydrated, ...init, path: normPath(opts.path) }
    }
    const cwd = init.cwd ?? process.cwd()
    const id = init.id ?? uuidv7()
    let path = opts.path ?? init.path
    path = path ? normPath(path) : undefined
    const writer = path ? createWriteStream(path, { flags: "a" }) : undefined
    return new Session({ ...init, cwd, id, path, writer })
  }

  /** Load existing records from `path` (when the file exists) and open
   *  the writer in append mode. New session-start / message / compact
   *  nodes will land on disk as they're committed. */
  static async #hydrate(path: string): Promise<Partial<SessionInit> | undefined> {
    // Honor `~` and any relative-to-cwd shorthand the caller passed.
    path = normPath(path)
    const text = await safeReadFile(path)
    if (text === undefined) return

    const nodes = new Map<string, SessionNode>()
    const lines = text.split("\n")
    // oxlint-disable-next-line oxc/no-accumulating-spread
    let meta: PersistedMeta = {}

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.length === 0) continue
      let record: PersistedNode
      try {
        record = JSON.parse(line) as PersistedNode
      } catch (error) {
        // Tolerate a truncated last line (crash mid-write); anything
        // else is real corruption.
        if (i === lines.length - 1) continue
        throw new Error(
          `Session.load: malformed JSON at line ${i + 1} of "${path}": ${(error as Error).message}`,
          { cause: error }
        )
      }
      // update meta with changes
      if (record.meta) meta = { ...meta, ...record.meta }
      const nodeMeta = splitMeta(meta).session
      const node = migrate({ ...record, meta: nodeMeta } as SessionNode, meta)
      nodes.set(record.uuid, node)
    }

    return {
      cwd: meta.cwd,
      id: meta.sessionId,
      meta,
      nodes,
      path,
    }
  }

  /** Initialize the session. On the first call (empty DAG) writes a
   *  `session-start` node; subsequent calls — including after
   *  `Session.load` rehydrates an existing file — write a
   *  `session-resume` node, so the DAG records every Agent that picks
   *  the session up. `meta` is merged into the cumulative session meta
   *  via the same diff-and-persist path as `update()`; only changed
   *  fields land on disk. */
  #autostart() {
    if (this.#started) return
    this.#started = true
    return this.#commit({
      meta: {},
      parentUuid: this.#head,
      ts: Date.now(),
      type: this.#messages.length > 0 ? "session-resume" : "session-start",
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

  get id(): string {
    return this.#id
  }

  get path(): string | undefined {
    return this.#path
  }

  get dir(): string {
    return this.#dir
  }

  get cwd(): string {
    return this.#cwd
  }

  get meta(): SessionMeta {
    return splitMeta(this.#meta).session
  }

  update(meta: SessionMeta) {
    return this.#commit({
      meta,
      parentUuid: this.#head,
      ts: Date.now(),
      type: "session-meta",
      uuid: uuidv7(),
    })
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
      meta: {},
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
  compact(opts: {
    trigger?: "manual" | "auto"
    preTokens?: number
    durationMs?: number
    tail: number
    summary: Message<"system">
  }): string {
    return this.#commit({
      durationMs: opts.durationMs,
      meta: {},
      parentUuid: this.#head,
      preTokens: opts.preTokens,
      summary: opts.summary,
      tail: opts.tail,
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
    if (this.#closed) return
    this.#closed = true
    const writer = this.#writer
    if (!writer) return
    this.#writer = undefined
    await new Promise<void>((resolve, reject) => {
      writer.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
    })
  }

  #internalMeta(): Required<InternalMeta> & { cwd: string } {
    return {
      cwd: this.#cwd,
      sessionId: this.#id,
      version: VERSION,
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Atomically commit a node: register it in the DAG, advance the
   *  head, update active messages, persist to disk if a writer is
   *  attached, and emit. Single chokepoint for all mutations. */
  #commit(node: SessionNode): string {
    if (!this.#started && node.type !== "session-start" && node.type !== "session-resume")
      this.#autostart()
    if (this.#closed) throw new Error("Session is closed")
    // Sync `#cwd` only when the incoming node carries an explicit cwd
    // (i.e. `start({ cwd })` or `update({ cwd })`). `add()` and
    // `compact()` pass `meta: {}`, so `node.meta.cwd` is undefined for
    // those — skip rather than clobbering `#cwd` to `process.cwd()`.
    if (node.meta.cwd !== undefined && node.meta.cwd !== this.#cwd) {
      this.#cwd = normPath(node.meta.cwd)
      this.emit("cwd", { cwd: this.#cwd })
    }
    const { meta, changes } = diffMeta(this.#meta, { ...node.meta, ...this.#internalMeta() })

    // No-op session-meta — don't add a node, don't advance head, don't emit.
    // Returns the *current* head so callers don't see a fabricated uuid.
    if (node.type === "session-meta" && changes === 0) {
      return this.#head ?? node.uuid
    }

    this.#nodes.set(node.uuid, node)
    this.#head = node.uuid
    if (node.type === "message") this.#messages.push(node.message)
    else if (node.type === "compact") this.#rebuild()

    const persistNode = { ...node } as PersistedNode

    if (changes > 0) {
      persistNode.meta = meta
      this.#meta = { ...this.#meta, ...meta }
      const updates = splitMeta(meta).session
      delete updates.cwd // cwd is emitted separately via the "cwd" event, so omit it from the "meta" event's changes
      if (Object.keys(updates).length > 0) this.emit("meta", { changes: updates, meta: this.meta })
    } else persistNode.meta = undefined

    node.meta = this.meta // ensure the in-memory node has the full meta
    this.#writer?.write(`${safeStringify(persistNode)}\n`)
    if (node.type === "compact") this.emit("compact", { node })
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
      // True chain boundaries — these clear the active conversation
      // context. `compact` is explicit; `session-start` is the root.
      if (node.type === "compact") {
        if (opts.active === true) {
          // Cross into pre-compact history, but only for `tailLength` messages
          let cursor2 = node.parentUuid
          let collected = 0
          while (cursor2 && collected < node.tail) {
            const n = this.#nodes.get(cursor2)
            if (!n) break
            if (n.type === "compact" || n.type === "session-start") break
            if (n.type === "message") {
              out.push({ message: n.message, ts: n.ts, uuid: n.uuid })
              collected++
            }
            cursor2 = n.parentUuid
          }
          // Emit the summary at the oldest position (will be FIRST after toReversed)
          out.push({ message: node.summary, ts: node.ts, uuid: node.uuid })
          break
        }
        // active=false / undefined: existing behavior unchanged
        pastBoundary = true
        cursor = node.parentUuid
        continue
      }
      if (node.type === "session-start") {
        if (opts.active === true) break
        pastBoundary = true
        cursor = node.parentUuid
        continue
      }
      // Non-message node types (`session-resume`, `session-meta`) are
      // markers, not boundaries — the active conversation flows through
      // them. Walk past without affecting the chain.
      if (node.type !== "message") {
        cursor = node.parentUuid
        continue
      }
      if (opts.active !== false || pastBoundary) {
        out.push({ message: node.message, ts: node.ts, uuid: node.uuid })
      }
      if (opts.limit !== undefined && out.length >= opts.limit) break
      cursor = node.parentUuid
    }
    return out.toReversed()
  }
}
