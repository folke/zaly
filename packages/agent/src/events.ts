import type { StreamEvent, TokenCount, ToolCallPart, ToolResult } from "@zaly/ai"

// ── Agent event union ────────────────────────────────────────────────────

/** Status of an agent session — at most one transition per moment.
 *  `paused` covers both explicit pause and post-error states; the
 *  `lastError` field on the session disambiguates. */
export type AgentStatus = "idle" | "streaming" | "running-tools" | "paused"

/** Reason the loop stopped this turn. Distinct from the provider's
 *  `finishReason` (which describes why one round-trip ended). */
export type AgentStopReason =
  | "natural"
  | "max-steps"
  | "token-budget"
  | "loop-detected"
  | "max-tool-errors"
  | "context-overflow"
  | "paused"
  | "aborted"
  | "error"

/** Outcome kind of a single step (one provider round-trip + tool batch).
 *  Returned from `step()` so custom drivers can interleave their own
 *  logic between steps. */
export type StepKind = "natural" | "tool-calls" | "context-overflow" | "error"

/** Events emitted by an `Agent` as the loop runs. Listeners fire
 *  synchronously; a throw inside a listener is caught and logged by
 *  the emitter so the loop keeps running.
 *
 *  Conversation-shape events (new message committed, head moved, …)
 *  live on the `Session`, not here — subscribe via `agent.session.on(…)`. */
export type AgentEvent =
  | { type: "status"; status: AgentStatus }
  | { type: "stream-event"; event: StreamEvent }
  | { type: "tool-call"; call: ToolCallPart }
  | { type: "tool-result"; call: ToolCallPart; result: ToolResult }
  | { type: "step-end"; outcome: StepKind }
  | { type: "stop"; reason: AgentStopReason; usage: TokenCount }

// ── Emitter ──────────────────────────────────────────────────────────────

/** A discriminated event union shape — every variant has a `type`. */
type EventBase = { type: string }

/** Listener narrowed by event-type tag. With no tag (or the full
 *  union as tag), it receives every event. */
export type Listener<E extends EventBase, K extends E["type"] = E["type"]> = (
  event: Extract<E, { type: K }>,
) => void

/** Tiny typed event emitter. Two `on` overloads:
 *
 *    emitter.on((e) => …)              // every event
 *    emitter.on("status", (e) => …)    // narrowed by `type`
 *
 *  `once` mirrors `on` and auto-unsubscribes after the first match.
 *  `off` removes a specific listener (works for both shapes — pass the
 *  handler reference). `on` and `once` also return an unsubscribe
 *  function for the common "store + cleanup" pattern.
 *
 *  Listener throws are caught and surfaced via `onEmitError` (silent
 *  if unset) so a buggy subscriber never takes down the emitter loop. */
export class Emitter<E extends EventBase> {
  readonly #listeners = new Map<E["type"] | "all", Set<Listener<E>>>([
    ["all", new Set()],
  ])
  readonly #wrappers = new WeakMap<Listener<E>, Listener<E>>()
  onEmitError?: (error: unknown) => void

  on(fn: Listener<E>): () => void
  on<K extends E["type"]>(type: K, fn: Listener<E, K>): () => void
  on(typeOrFn: unknown, fn?: unknown): () => void {
    return this.#on(typeOrFn, fn)
  }

  once(fn: Listener<E>): () => void
  once<K extends E["type"]>(type: K, fn: Listener<E, K>): () => void
  once(typeOrFn: unknown, fn?: unknown): () => void {
    return this.#on(typeOrFn, fn, true)
  }

  #on(typeOrFn: unknown, maybeFn?: unknown, once?: boolean): () => void {
    const handler = (typeof typeOrFn === "function" ? typeOrFn : maybeFn) as Listener<E>
    const type = typeof typeOrFn === "function" ? ("all" as const) : (typeOrFn as E["type"])
    let wrapped: Listener<E> | undefined
    if (once) {
      wrapped = (event) => {
        this.off(handler)
        handler(event)
      }
      this.#wrappers.set(handler, wrapped)
    }
    let set = this.#listeners.get(type)
    if (!set) {
      set = new Set()
      this.#listeners.set(type, set)
    }
    set.add(wrapped ?? handler)
    return () => this.off(handler)
  }

  /** Remove a previously-registered listener. Pass the same function
   *  reference used with `on` / `once`. */
  off(fn: Listener<E>): void {
    const target = this.#wrappers.get(fn) ?? fn
    for (const set of this.#listeners.values()) set.delete(target)
  }

  protected emit(event: E): void {
    const listeners = [
      ...(this.#listeners.get("all") ?? []),
      ...(this.#listeners.get(event.type) ?? []),
    ]
    for (const fn of listeners)
      try {
        fn(event as Extract<E, { type: typeof event.type }>)
      } catch (error) {
        this.onEmitError?.(error)
      }
  }
}
