import type { Message, MetaPart } from "@zaly/ai"
import type { Agent } from "./agent.ts"

/** A registered agent in the swarm — a node in the agent tree. The
 *  `name` IS the id: agents address each other by name, so there's no
 *  point in maintaining a separate uuid the model would have to
 *  remember. Collisions get an auto-suffix (`reviewer`, `reviewer-2`,
 *  `reviewer-3`, …) resolved at `attach` time; reading `entry.name`
 *  after attach tells the caller which suffix landed. The parent
 *  relationship lives on `agent.parent` — single source of truth. */
export interface SwarmEntry {
  /** Unique identity within the swarm. Same string as `name` (kept as
   *  a separate field for code that wants to be explicit about "this
   *  is the lookup key vs. the displayable name"). */
  id: string
  /** Resolved name (with collision suffix if needed). What other
   *  agents type when addressing this one. */
  name: string
  desc: string
  agent: Agent
  /** Wallclock at registration. */
  startedAt: number
}

/** Options for spawning a new subagent via `Swarm.spawn`. */
export interface SpawnOptions {
  /** Human-readable identity for inter-agent addressing — e.g.
   *  `"reviewer"`, `"researcher"`. Other agents reference the spawned
   *  agent by this name in `<agent>` meta tags. */
  name: string
  /** What this agent is doing (one short line). Surfaced in
   *  `task_list` / `<agent>` headers so the orchestrator can keep
   *  track of who's working on what. */
  desc: string
  /** System prompt for the child. Spelled out from scratch — the child
   *  does NOT inherit the parent's prompt. */
  prompt: string
  /** Initial task for the child. When set, the swarm sends it as the
   *  child's first user message right after spawn. Omit to spawn an
   *  agent that idles waiting for the first `send`. */
  task?: string
}

/**
 * Tree of cooperating agents. One `Swarm` instance per agent tree —
 * the orchestrator (root), every subagent it spawns, every subagent
 * THEY spawn, all live in the same swarm and address each other by
 * `name`.
 *
 * Responsibilities:
 *   - Register / look up agents in the tree.
 *   - Spawn subagents under a parent (delegates inheritance to
 *     `parent.child(...)`; the swarm just records the metadata and
 *     routes the initial task message).
 *   - Route messages between agents (`send(from, to, content)`
 *     injects a `<agent>` system message into the receiver carrying
 *     the sender's identity).
 *   - Tear-down (`stop(id)` aborts the agent and removes the entry).
 *
 * Not yet wired into `Tasks` or the tool catalog — that lands as a
 * follow-up. This module is the data structure + lifecycle.
 */
export class Swarm {
  readonly #entries = new Map<string, SwarmEntry>()
  /** Reverse index `Agent → SwarmEntry`. WeakMap so an unregistered
   *  agent's entry is GC'd if the Agent ever goes away on its own;
   *  also gives O(1) lookup for `find()` and per-agent attach
   *  idempotency without scanning `#entries`. */
  readonly #byAgent = new WeakMap<Agent, SwarmEntry>()

  // ── Lookup ───────────────────────────────────────────────────────────

  /** Look up an entry by id. */
  get(id: string): SwarmEntry | undefined {
    return this.#entries.get(id)
  }

  /** Reverse lookup: find an entry by Agent instance. Returns
   *  `undefined` for agents that haven't been registered. */
  find(agent: Agent): SwarmEntry | undefined {
    return this.#byAgent.get(agent)
  }

  /** All registered entries (root + every subagent). */
  get entries(): readonly SwarmEntry[] {
    return [...this.#entries.values()]
  }

  /** Direct children of the given agent (one level only). Walks the
   *  agent-side parent pointer (`agent.parent`) so the swarm stays
   *  free of duplicate parent state. */
  children(parent: Agent): SwarmEntry[] {
    return [...this.#entries.values()].filter((e) => e.agent.parent === parent)
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /** Register an existing Agent in the swarm. Use this to label the
   *  root (the orchestrator that wasn't spawned by `spawn`) with a
   *  name + description so other swarm members can address it.
   *
   *  The `name` doubles as the entry's id — the swarm resolves
   *  collisions by auto-suffixing (`reviewer`, `reviewer-2`, ...).
   *  Read the returned `entry.name` to find the actual assigned
   *  identity if you care which suffix landed.
   *
   *  Idempotent on the same `Agent` instance: re-attaching returns
   *  the existing entry, ignoring the new opts. To re-name an agent,
   *  `stop()` first then re-attach.
   *
   *  Reserved: `name` of `"user"` and the empty string both throw —
   *  the former conflicts with the human-sender identity in `<agent>`
   *  meta; the latter is a programming error. */
  attach(agent: Agent, opts: { name: string; desc: string }): SwarmEntry {
    if (opts.name === "") throw new Error("Swarm.attach: `name` must be non-empty")
    if (opts.name === "user") throw new Error('Swarm.attach: `name` "user" is reserved')
    const existing = this.#byAgent.get(agent)
    if (existing) return existing
    const id = this.#resolveName(opts.name)
    const entry: SwarmEntry = {
      agent,
      desc: opts.desc,
      id,
      name: id,
      startedAt: Date.now(),
    }
    this.#entries.set(id, entry)
    this.#byAgent.set(agent, entry)
    this.#wireForwarding(entry)
    return entry
  }

  /** Resolve a name to an unused id. Plain `name` if free; otherwise
   *  `name-2`, `name-3`, … — next-available, not highest-ever-seen,
   *  so a `stop()` frees the name for re-use. */
  #resolveName(name: string): string {
    if (!this.#entries.has(name)) return name
    let n = 2
    while (this.#entries.has(`${name}-${n}`)) n++
    return `${name}-${n}`
  }

  /** Spawn a new subagent under `parent`. Inheritance (cwd, model,
   *  permissions, effective tools) is delegated to `parent.child(...)`;
   *  the swarm then attaches the child and (optionally) seeds it with
   *  `opts.task` as its first user message. */
  async spawn(parent: Agent, opts: SpawnOptions): Promise<SwarmEntry> {
    const child = await parent.child({ prompt: [opts.prompt] })
    const entry = this.attach(child, { desc: opts.desc, name: opts.name })
    if (opts.task !== undefined && opts.task !== "") {
      child.send({ content: opts.task, role: "user" })
    }
    return entry
  }

  /** Send a message from one agent to another. The receiver gets a
   *  message tagged `<agent>` with sender metadata (`name` + `id`) so
   *  it can parse who's speaking and respond by addressing them back.
   *
   *  Role:
   *    - `role: "user"` when the sender is the receiver's parent (or
   *      the literal `"user"`) — from the receiver's perspective the
   *      sender IS its user.
   *    - `role: "system"` otherwise (child → parent reports, sibling
   *      messages, unregistered senders). */
  send(from: Agent | "user", to: Agent, content: string): void {
    const meta = this.#senderMeta(from)
    const isUser = from === "user" || (from instanceof Object && to.parent === from)
    const message: Message<"user" | "system"> = isUser
      ? { content, role: "user" }
      : { content: [meta, { text: content, type: "text" }], role: "system" }
    to.inject(message)
  }

  /** Stop a registered subagent. Aborts its in-flight run and removes
   *  the entry. The `Agent` itself is NOT disposed — call
   *  `agent.dispose()` separately if you need its resources released. */
  stop(id: string): void {
    const entry = this.#entries.get(id)
    if (!entry) return
    entry.agent.stop()
    this.#entries.delete(id)
    this.#byAgent.delete(entry.agent)
  }

  /** Stop every registered agent in the swarm. */
  stopAll(): void {
    // Snapshot ids first — `stop()` mutates `#entries`, and modifying a
    // Map mid-iteration is unsafe.
    const ids = [...this.#entries.keys()]
    for (const id of ids) this.stop(id)
  }

  // ── Internals ────────────────────────────────────────────────────────

  /** Wire an entry's agent so its outward assistant messages — text
   *  parts only, after a natural step-end — auto-forward to the
   *  parent via `send(child, parent, …)`. No-op for entries without
   *  a parent (the root has nowhere to report).
   *
   *  Hooked on `step-end` rather than `stop` so each natural
   *  checkpoint reports — important once interactive subagents land
   *  (a child can have many natural step-ends across its lifetime). */
  #wireForwarding(entry: SwarmEntry): void {
    const { agent } = entry
    const parent = agent.parent
    if (!parent) return
    agent.on("step-end", ({ outcome }) => {
      if (outcome !== "natural") return
      const last = agent.messages.at(-1)
      if (last?.role !== "assistant") return
      const text = assistantText(last.content)
      if (text === "") return
      this.send(agent, parent, text)
    })
  }

  #senderMeta(from: Agent | "user"): MetaPart {
    if (from === "user") {
      return { data: { from: "user" }, tag: "agent", type: "meta" }
    }
    const entry = this.find(from)
    return {
      data: {
        from: entry?.name ?? "agent",
        id: entry?.id,
      },
      tag: "agent",
      type: "meta",
    }
  }
}

/** Extract just the visible text from an assistant message — text
 *  parts only, no reasoning, no tool calls. The forwarding path uses
 *  this so a child's outward report carries the answer without leaking
 *  its private working trajectory (thinking, intermediate tool calls). */
function assistantText(content: Message<"assistant">["content"]): string {
  if (typeof content === "string") return content.trim()
  return content
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim()
}
