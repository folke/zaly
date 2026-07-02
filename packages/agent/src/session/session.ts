import type { Message } from "@zaly/ai"
import type { SessionStore } from "./store.ts"
import type {
  MaskCheckpoint,
  PartialNode,
  SessionEvents,
  SessionInit,
  SessionMessage,
  SessionNode,
  SessionNodeView,
  SessionOptions,
  SessionSettings,
  SessionUpdate,
  SessionView,
} from "./types.ts"

import { Emitter, normPath } from "@zaly/shared"
import { zalyPaths } from "@zaly/shared/paths"
import { isDeepStrictEqual } from "node:util"
import { join } from "pathe"
import { uuidv7 } from "../utils/uuid.ts"
import { JsonlStore } from "./jsonl.ts"
import { MemoryStore } from "./memory.ts"

const VERSION = 2

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
  #opts: SessionInit<T>
  #id: string
  #dir: string
  #settings: SessionSettings = {}
  #view: SessionView = { messages: [], nodes: new Map() }
  #closed = false
  #started = false
  #path?: string
  #head?: string

  protected constructor(opts: SessionInit<T>) {
    super()
    this.#opts = opts
    this.#path = opts.path
    this.#store = opts.store
    this.#id = opts.defaults?.sessionId ?? uuidv7()
    this.#dir = normPath(opts.dir ?? join(zalyPaths.env.tmp, "sessions", this.#id))
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
    const session = await Session.create(opts)
    await session.#rebuild()
    return session
  }

  private static async create(opts: SessionOptions = {}): Promise<Session> {
    const path = opts.path ? normPath(opts.path) : undefined
    const store: SessionStore =
      opts.store ?? (path ? await JsonlStore.load(path) : new MemoryStore())
    const init: SessionInit = { ...opts, path, store }
    return new Session(init)
  }

  /** Efficiently fetch the most recent user message by walking backward until we hit
   * a user message, without reconstructing the full chain. Useful for a session picker. */
  static async lastMessage(opts: SessionOptions = {}): Promise<Message<"user"> | undefined> {
    const session = await Session.create(opts)
    let ret: Message<"user"> | undefined
    await session.#chain({
      stop: (node) => {
        if (node.type === "message" && node.message.role === "user") {
          ret = node.message
          return true
        }
        return false
      },
    })
    void session.close()
    return ret
  }

  async #rebuild(): Promise<void> {
    const chain = await this.#chain()
    this.#view = chain
    this.#settings = chain.settings
    this.#id = chain.settings.sessionId ?? this.#id
  }

  // ── Read ──────────────────────────────────────────────────────────────

  /** Active conversation — chain from current head back to the most
   *  recent compact (exclusive), in chronological order. This is what
   *  the agent sees on the next request. */
  get messages(): readonly Message[] {
    return this.#view.messages
  }

  get maskCheckpoint(): MaskCheckpoint | undefined {
    return this.#view.maskCheckpoint
  }

  get id(): string {
    return this.#id
  }

  get dir(): string {
    return this.#dir
  }

  get path(): string | undefined {
    return this.#path
  }

  get started(): boolean {
    return this.#started
  }

  /** Current session settings, merged with defaults. */
  get settings(): SessionSettings {
    return { ...this.#opts.defaults, ...this.#settings }
  }

  async update(settings: SessionUpdate, opts?: { force?: boolean }): Promise<string> {
    return this.#commit({ settings, type: "session-settings" }, opts)
  }

  /** Lazily emits `session-start` on a fresh session or `session-resume`
   *  on a hydrated one. Called from `#commit` before the first non-marker
   *  node lands so the start/resume marker always heads the chain. */
  async #autostart(): Promise<void> {
    if (!this.#started) await this.start()
  }

  /** Explicitly mark the session as started — writes a `session-start`
   *  marker on a fresh session, `session-resume` on a hydrated one.
   *  Idempotent; subsequent calls are no-ops. Optional `meta` is
   *  applied via `update()` after the marker lands. */
  async start(settings?: SessionUpdate): Promise<string | undefined> {
    if (this.#started) return settings ? this.update(settings) : this.#store.root?.uuid
    this.#started = true
    const type = this.messages.length > 0 ? ("session-resume" as const) : ("session-start" as const)
    await this.#commit({ type })
    void this.emit(type)
    await this.update(settings ?? {})
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
    return this.#head ?? this.#store.root?.uuid
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
    const m = { ...message, id: uuid, ts }
    return this.#commit({ message: m, type: "message" })
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
    void this.emit("compact", { node })
    return compactUuid
  }

  async addMaskCheckpoint(opts: MaskCheckpoint): Promise<string> {
    this.#view.maskCheckpoint = opts
    return this.#commit({ ...opts, type: "mask-checkpoint" })
  }

  async checkout(uuid: string): Promise<void> {
    if (this.#closed) throw new Error("Session is closed")
    this.#head = uuid
    await this.#rebuild()
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
  async #commit(n: PartialNode, opts: { force?: boolean } = {}): Promise<string> {
    let node: SessionNode = {
      ...n,
      parentUuid: this.head,
      ts: Date.now(),
      uuid: uuidv7(),
    }

    if (!this.#started && node.type !== "session-start" && node.type !== "session-resume") {
      await this.#autostart()
    }
    if (this.#closed) throw new Error("Session is closed")

    const next: SessionSettings = {
      ...this.#opts.defaults,
      ...this.#settings,
      ...(node.type === "session-settings" ? node.settings : {}),
      sessionId: this.#id,
      version: VERSION,
    }
    if (next.cwd) next.cwd = normPath(next.cwd)
    if (next.workspace) next.workspace = normPath(next.workspace)

    if (node.type === "session-settings") {
      if (!opts.force && isDeepStrictEqual(this.#settings, next)) return this.#store.root!.uuid
      node = { ...node, settings: next }
    }

    node = { ...node, parentUuid: this.head }
    await this.#store.write(node)
    this.#head = undefined // invalidate head cache so it reflects the store's root on next read

    // Decorate the new node with cumulative meta and append to the
    // active chain view
    this.#view.nodes.set(node.uuid, { ...node, settings: next })
    if (node.type === "message") this.#view.messages.push(node.message)

    // cwd / meta event signaling
    if (node.type === "session-settings") {
      const prev = this.#settings
      this.#settings = next
      this.#emitChanges(prev)
    }

    void this.emit("node", { node })
    return node.uuid
  }

  #emitChanges(prev: SessionSettings): void {
    const next = this.#settings
    if (next.cwd && next.cwd !== prev.cwd) void this.emit("cwd", { cwd: next.cwd, prev: prev.cwd })
    if (next.modelId && next.modelId !== prev.modelId)
      void this.emit("model", { model: next.modelId, prev: prev.modelId })
    if (next.reasoning && next.reasoning !== prev.reasoning)
      void this.emit("reasoning", { effort: next.reasoning, prev: prev.reasoning })
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
    opts: {
      active?: boolean
      limit?: number
      uuid?: string
      stop?: (node: SessionNode) => boolean
    } = {}
  ): Promise<SessionView & { settings: SessionSettings }> {
    // Backward pass: collect raw nodes (new to old)
    const reverse: SessionNode[] = []
    let cursor = opts.uuid ?? this.head
    let limit = opts.limit ?? Infinity
    let compact: SessionNode<"compact"> | undefined
    const messageNodes: SessionNode<"message">[] = []
    let maskCheckpoint: SessionNode<"mask-checkpoint"> | undefined

    // Walk backward from the head until we hit a compact or the start, collecting nodes.
    while (cursor) {
      // eslint-disable-next-line no-await-in-loop
      const node = await this.#store.get(cursor)
      if (!node || (node.type === "message" && messageNodes.length + 1 > limit)) break
      cursor = node.parentUuid
      reverse.push(node)
      // Keep track if the last mask-checkpoint, until we hit a compaction.
      if (node.type === "mask-checkpoint" && !compact && !maskCheckpoint) maskCheckpoint = node
      if (node.type === "message") messageNodes.push(node)
      if (node.type === "compact" && (opts.active ?? true)) {
        if (compact) break // stop at the first compact
        compact = node
        // update limit to the compact's tail
        limit = Math.min(limit, messageNodes.length + node.tail)
      }
      if (opts.stop?.(node)) break
    }

    // Forward pass: decorate with cumulative meta. session-meta nodes
    // redefine the meta; everything else inherits the running snapshot.
    const nodes = new Map<string, SessionNodeView>()
    let settings: SessionSettings = {}
    for (const n of reverse.toReversed()) {
      if (n.type === "session-settings") settings = n.settings
      nodes.set(n.uuid, { ...n, settings })
    }

    this.#migrate(nodes)

    const messages: SessionMessage[] = []
    for (const n of messageNodes) {
      // add `id`, `ts` and `modelId` (if assistant turn) to the message
      const m = { ...n.message, id: n.uuid, ts: n.ts }
      if (m.role === "assistant") {
        // Add missing modelId to assistant messages if not present
        const s = nodes.get(n.uuid)?.settings ?? {}
        m.meta = { ...m.meta, modelId: m.meta?.modelId ?? s.modelId }
      }
      n.message = m
      messages.push(m)
    }

    // Add compaction summary as the first message
    if (compact) {
      messages.push({ ...compact.summary, id: compact.uuid, ts: compact.ts })
      nodes.set(compact.uuid, {
        message: compact.summary,
        parentUuid: compact.parentUuid,
        settings: nodes.get(compact.uuid)?.settings ?? {},
        ts: compact.ts,
        type: "message",
        uuid: compact.uuid,
      })
    }

    return {
      compact,
      maskCheckpoint,
      messages: messages.toReversed(),
      nodes,
      settings,
    }
  }

  #migrate(nodes: Map<string, SessionNodeView>) {
    for (const n of nodes.values()) {
      const version = n.settings.version ?? 0
      if (version === VERSION) continue
      n.settings = { ...n.settings, version: VERSION }

      if (n.type === "compact") {
        n.summary.meta = { kind: "compaction-summary", ...n.summary.meta }
        continue
      }

      if (n.type !== "message") continue
      const m = n.message

      if (
        m.role === "system" &&
        Array.isArray(m.content) &&
        m.content[0].type === "meta" &&
        m.content[0].tag === "task"
      ) {
        // Missing task meta data kind
        m.meta = { kind: "task", ...m.meta }
      }

      n.message = m
    }
  }
}
