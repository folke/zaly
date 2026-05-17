import type { Message } from "@zaly/ai"
import type { SessionStore } from "./store.ts"
import type {
  InternalMeta,
  PersistedMeta,
  SessionEvents,
  SessionInit,
  SessionMessage,
  SessionMeta,
  SessionNode,
  SessionNodeView,
  SessionOptions,
  SessionView,
} from "./types.ts"

import { Emitter, normPath } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { isDeepStrictEqual } from "node:util"
import { join } from "pathe"
import { uuidv7 } from "../utils/uuid.ts"
import { JsonlStore } from "./jsonl.ts"
import { MemoryStore } from "./memory.ts"

const VERSION = 1

function splitMeta(meta: PersistedMeta): { internal: InternalMeta; session: SessionMeta } {
  const { version, sessionId, ...session } = meta
  const internal: InternalMeta = { sessionId, version }
  return { internal, session }
}

/**
 * Conversation primitive. Owns a DAG of message + compaction + meta
 * nodes via a `SessionStore` backend; the *active* message list is
 * whatever you get by walking `parentUuid` backwards from the store's
 * root until you hit a `compact` node (or the start).
 *
 * **Meta is snapshot-based.** `session-meta` nodes carry the full
 * cumulative meta as of their commit time. Other node types (start,
 * resume, message, compact) don't carry meta — `Session` reconstructs
 * the cumulative meta at any point by finding the most recent
 * `session-meta` ancestor in a forward pass over the chain. Public
 * APIs return `SessionNodeView` (raw node + decorated `meta`).
 *
 * Designed so the loop, the persistor, the TUI, and any replay tool
 * all read from one source of truth and never mutate the DAG behind
 * each other's backs:
 *
 * - **Run loop** (`Agent`) calls `add()` on each new message and
 *   `compact()` on overflow.
 * - **TUI** subscribes to the `node` event for streaming render.
 * - **Persistor** is the `SessionStore` — `MemoryStore` for ephemeral
 *   sessions, `JsonlStore` for file-backed.
 *
 * Construction:
 *   - Use `await Session.load(opts)` for the recommended path — picks
 *     the right store (Memory if no path, JSONL if path).
 *   - For tests / direct embedding, `new Session({ store })` works with
 *     any pre-built store.
 */
export class Session<T extends SessionStore = SessionStore> extends Emitter<SessionEvents> {
  readonly #store: T
  #id: string
  #cwd: string
  #dir: string
  #path?: string
  #view: SessionView = { messages: [], meta: {}, nodes: new Map() }
  #closed = false
  #started = false

  protected constructor(opts: SessionInit<T>) {
    super()
    this.#store = opts.store
    this.#id = opts.id ?? uuidv7()
    this.#cwd = normPath(opts.cwd ?? process.cwd())
    this.#dir = normPath(opts.dir ?? join(zalyPaths.env.tmp, "sessions"))
    this.#path = opts.path ? normPath(opts.path) : undefined
  }

  /** Recommended one-step path: pick the right store backend, hydrate
   *  if applicable, return a ready-to-use session.
   *
   *  - `path` provided → `JsonlStore` (file-backed, hydrates from disk
   *    if the file exists, opens for append either way).
   *  - No `path` → `MemoryStore` (ephemeral, no persistence). */
  static async load<T extends SessionStore = SessionStore>(
    opts: SessionOptions<T> & { store: T }
  ): Promise<Session<T>>
  static async load(opts: SessionOptions & { path: string }): Promise<Session<JsonlStore>>
  static async load(opts?: SessionOptions & {}): Promise<Session<MemoryStore>>
  static async load(opts: SessionOptions = {}): Promise<Session> {
    const cwd = opts.cwd ?? process.cwd()
    const path = opts.path ? normPath(opts.path) : undefined
    const store: SessionStore =
      opts.store ?? (path ? await JsonlStore.load(path) : new MemoryStore())
    const init: SessionInit = { ...opts, cwd, path, store }
    const ret = new Session(init)
    await ret.#rebuild()
    return ret
  }

  async #rebuild(): Promise<void> {
    this.#view = await this.#chain()
    this.#id = this.#view.meta.sessionId ?? this.#id
    // Sync `#cwd` from the hydrated/active meta so a loaded session
    // reflects the cwd it was originally operating under, not the
    // process.cwd() of the loader.
    if (this.#view.meta.cwd) this.#cwd = normPath(this.#view.meta.cwd)
  }

  /** Lazily emits `session-start` on a fresh session or `session-resume`
   *  on a hydrated one. Called from `#commit` before the first non-marker
   *  node lands so the start/resume marker always heads the chain. */
  async #autostart(): Promise<void> {
    if (this.#started) return
    this.#started = true
    const type = this.messages.length > 0 ? ("session-resume" as const) : ("session-start" as const)
    await this.#commit({
      parentUuid: this.#store.root?.uuid,
      ts: Date.now(),
      type,
      uuid: uuidv7(),
    })
    this.emit(type)
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Active conversation — chain from current head back to the most
   *  recent compact (exclusive), in chronological order. This is what
   *  the agent sees on the next request. */
  get messages(): readonly Message[] {
    return this.#view.messages
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

  /** Cumulative session meta as of the current head — derived from the
   *  most recent `session-meta` snapshot in the active chain. */
  get meta(): SessionMeta {
    return splitMeta(this.#view.meta).session
  }

  async update(meta: SessionMeta, opts?: { force?: boolean }): Promise<string> {
    return this.#commit(
      {
        meta,
        parentUuid: this.#store.root?.uuid,
        ts: Date.now(),
        type: "session-meta",
        uuid: uuidv7(),
      },
      opts
    )
  }

  /** Explicitly mark the session as started — writes a `session-start`
   *  marker on a fresh session, `session-resume` on a hydrated one.
   *  Idempotent; subsequent calls are no-ops. Optional `meta` is
   *  applied via `update()` after the marker lands. */
  async start(meta?: SessionMeta): Promise<string | undefined> {
    await this.#autostart()
    if (meta) await this.update(meta)
    return this.#store.root?.uuid
  }

  /** Look up the decorated view for a node id — raw node plus the
   *  cumulative meta as of that node's position. Returns the
   *  message-typed view, or `undefined` if the id doesn't refer to a
   *  message in this session. */
  async node(id?: string | Message): Promise<(SessionNodeView & { type: "message" }) | undefined> {
    const m = typeof id === "string" ? { id } : id
    if (!m?.id) return undefined
    const ret = this.#view.nodes.get(m.id)
    return ret?.type === "message" ? ret : undefined
  }

  /** Current head uuid — the root of the store, which is the most
   *  recently appended node. */
  get head(): string | undefined {
    return this.#store.root?.uuid
  }

  /** Full DAG iterator — backed by `store.all()`. Yields raw nodes
   *  (no meta decoration). */
  nodes(): Iterable<SessionNode> | AsyncIterable<SessionNode> {
    return this.#store.all?.() ?? []
  }

  get root(): SessionNode | undefined {
    return this.#store.root
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
  async add(message: Message): Promise<string> {
    const uuid = message.id ?? uuidv7()
    const ts = message.ts ?? Date.now()
    const current = this.#view.meta.modelId

    const m = { ...message, id: uuid, ts }
    if (m.role === "assistant" && m.meta) {
      const { modelId, ...meta } = m.meta ?? {}
      if (modelId && modelId !== current) await this.update({ modelId: m.meta.modelId })
      m.meta = meta
    }
    return this.#commit({
      message: m,
      parentUuid: this.#store.root?.uuid,
      ts,
      type: "message",
      uuid,
    })
  }

  /** Mark a compaction boundary. Subsequent `add()` calls land after
   *  this node; their messages form the new active conversation. The
   *  pre-compact chain stays in the store but is no longer part of
   *  `messages`. Also commits a fresh `session-meta` snapshot right
   *  after the compact so post-compact lazy walks always have a nearby
   *  meta anchor. */
  async compact(opts: {
    trigger?: "manual" | "auto"
    preTokens?: number
    durationMs?: number
    tail: number
    summary: Message<"system">
  }): Promise<string> {
    const node: SessionNode = {
      durationMs: opts.durationMs,
      parentUuid: this.#store.root?.uuid,
      preTokens: opts.preTokens,
      summary: opts.summary,
      tail: opts.tail,
      trigger: opts.trigger ?? "manual",
      ts: Date.now(),
      type: "compact",
      uuid: uuidv7(),
    }
    const compactUuid = await this.#commit(node)
    await this.update({}, { force: true })
    await this.#rebuild()
    this.emit("compact", { node })
    return compactUuid
  }

  /** Pre-active history of the current chain — messages from before
   *  the most recent compact (and earlier compacts), in chronological
   *  order. Useful for TUI scrollback that wants to render context the
   *  agent itself no longer sees.
   *
   *  `limit` truncates from the front (oldest), so the most recent
   *  history messages always make it through. */
  async history(limit?: number): Promise<readonly Message[]> {
    const chain = await this.#chain({ active: false, limit })
    return chain.messages
  }

  /** Flush + close the underlying store. Subsequent writes throw. */
  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    await this.#store.close?.()
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Atomically commit a node: register it in the store, update active
   *  messages, persist, and emit. Single chokepoint for all mutations. */
  async #commit(node: SessionNode, opts: { force?: boolean } = {}): Promise<string> {
    if (!this.#started && node.type !== "session-start" && node.type !== "session-resume") {
      await this.#autostart()
    }
    if (this.#closed) throw new Error("Session is closed")

    // update cwd if needed
    this.#cwd = node.type === "session-meta" && node.meta.cwd ? normPath(node.meta.cwd) : this.#cwd

    const next: PersistedMeta = {
      ...this.#view.meta,
      ...(node.type === "session-meta" ? node.meta : {}),
      cwd: this.#cwd,
      sessionId: this.#id,
      version: VERSION,
    }

    if (node.type === "session-meta") {
      if (!opts.force && isDeepStrictEqual(this.#view.meta, next)) return this.#store.root!.uuid
      node = { ...node, meta: next }
    } else if (
      node.type !== "session-start" &&
      node.type !== "session-resume" &&
      !isDeepStrictEqual(this.#view.meta, next)
    ) {
      await this.update({})
    }

    node = { ...node, parentUuid: this.#store.root?.uuid }
    await this.#store.write(node)

    // Decorate the new node with cumulative meta and append to the
    // active chain view
    this.#view.nodes.set(node.uuid, { ...node, meta: next })
    if (node.type === "message") this.#view.messages.push(node.message)

    // cwd / meta event signaling
    if (node.type === "session-meta") {
      const prev = this.#view.meta
      this.#cwd = normPath(next.cwd)
      this.#view.meta = next
      this.#emitChanges(prev)
    }

    this.emit("node", { node })
    return node.uuid
  }

  #emitChanges(meta: PersistedMeta): void {
    const prev = splitMeta(meta).session
    const next = splitMeta(this.#view.meta).session
    if (next.cwd !== undefined && next.cwd !== prev.cwd) this.emit("cwd", { cwd: next.cwd })
    const changes: Partial<Omit<SessionMeta, "cwd">> = {}
    for (const k of Object.keys(next) as (keyof SessionMeta)[]) {
      if (k === "cwd") continue
      if (!isDeepStrictEqual(next[k], prev[k])) {
        ;(changes as Record<string, unknown>)[k] = next[k]
      }
    }
    if (Object.keys(changes).length > 0) this.emit("meta", { changes, meta: next, prev })
  }

  /** Walk `parentUuid` from the given node back toward the root,
   *  returning the chain as decorated views (each with cumulative meta).
   *  The `active` flag controls what counts:
   *    - `true`      — only the active chain (stops at first compact /
   *                    session-start, with the kept tail spliced in via
   *                    the compact's `tail` field, summary substituted
   *                    in place of the compact node).
   *    - `false`     — includes everything back to the root
   *  Returns chronological order. */
  async #chain(
    opts: { active?: boolean; limit?: number; uuid?: string } = {}
  ): Promise<SessionView> {
    // Backward pass: collect raw nodes (new to old)
    const reverse: SessionNode[] = []
    let cursor = opts.uuid ?? this.#store.root?.uuid
    let limit = opts.limit ?? Infinity
    let compact: SessionNode<"compact"> | undefined
    const messageNodes: SessionNode<"message">[] = []

    while (cursor) {
      // eslint-disable-next-line no-await-in-loop
      const node = await this.#store.get(cursor)
      if (!node || (node.type === "message" && messageNodes.length + 1 > limit)) break
      cursor = node.parentUuid
      reverse.push(node)
      if (node.type === "message") messageNodes.push(node)
      if (node.type === "compact" && (opts.active ?? true)) {
        if (compact) break // stop at the first compact
        compact = node
        // update limit to the compact's tail
        limit = Math.min(limit, messageNodes.length + node.tail)
      }
    }

    // Forward pass: decorate with cumulative meta. session-meta nodes
    // redefine the meta; everything else inherits the running snapshot.
    const nodes = new Map<string, SessionNodeView>()
    let meta: PersistedMeta = {}
    for (const n of reverse.toReversed()) {
      if (n.type === "session-meta") meta = n.meta
      nodes.set(n.uuid, { ...n, meta })
    }

    const messages: SessionMessage[] = []
    for (const n of messageNodes) {
      // add `id`, `ts` and `modelId` (if assistant turn) to the message
      const m = { ...n.message, id: n.uuid, ts: n.ts }
      if (m.role === "assistant") m.meta = { ...m.meta, modelId: meta.modelId }
      n.message = m
      messages.push(m)
    }

    // Add compaction summary as the first message
    if (compact) {
      messages.push({ ...compact.summary, id: compact.uuid, ts: compact.ts })
      nodes.set(compact.uuid, {
        message: compact.summary,
        meta: nodes.get(compact.uuid)?.meta ?? {},
        parentUuid: compact.parentUuid,
        ts: compact.ts,
        type: "message",
        uuid: compact.uuid,
      })
    }

    return {
      compact,
      messages: messages.toReversed(),
      meta,
      nodes,
    }
  }
}
