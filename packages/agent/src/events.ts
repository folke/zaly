import type { Message, StreamEvent, TokenCount, ToolCallPart, ToolResult } from "@zaly/ai"

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

/** Events emitted by an `AgentSession` as the loop runs. Listeners
 *  fire synchronously; a throw inside a listener is caught and logged
 *  by the emitter so the loop keeps running. */
export type AgentEvent =
  | { type: "status"; status: AgentStatus }
  | { type: "stream-event"; event: StreamEvent }
  | { type: "message"; message: Message }
  | { type: "replace"; before: readonly Message[]; after: readonly Message[] }
  | { type: "tool-call"; call: ToolCallPart }
  | { type: "tool-result"; call: ToolCallPart; result: ToolResult }
  | { type: "step-end"; outcome: StepKind }
  | { type: "stop"; reason: AgentStopReason; usage: TokenCount }

// ── Emitter ──────────────────────────────────────────────────────────────

type AgentEventType = AgentEvent["type"]

/** Listener that receives every event in the union. */
export type Listener<E extends AgentEventType = AgentEventType> = (
  event: Extract<AgentEvent, { type: E }>
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
 *  Listener throws are caught + logged so a buggy subscriber never
 *  takes down the emitter loop. */
export class Emitter {
  readonly #listeners = new Map<AgentEventType | "all", Set<Listener>>([["all", new Set()]])
  readonly #wrappers = new WeakMap<Listener, Listener>()
  onEmitError?: (error: unknown) => void

  on(fn: Listener): () => void
  on<E extends AgentEventType>(type: E, fn: Listener<E>): () => void
  on(typeOrHandler: AgentEventType | Listener, handler?: Listener): () => void {
    return this.#on(typeOrHandler, handler)
  }

  once(fn: Listener): () => void
  once<E extends AgentEventType>(type: E, fn: Listener<E>): () => void
  once(typeOrHandler: AgentEventType | Listener, handler?: Listener): () => void {
    return this.#on(typeOrHandler, handler, true)
  }

  #on(typeOrFn: AgentEventType | Listener, fn?: Listener, once?: boolean): () => void {
    fn ??= typeOrFn as Listener
    const type = typeof typeOrFn === "function" ? "all" : typeOrFn
    let wrapped: Listener | undefined
    if (once) {
      wrapped = (event) => {
        this.off(fn)
        fn(event)
      }
      this.#wrappers.set(fn, wrapped)
    }
    let set = this.#listeners.get(type)
    if (!set) {
      set = new Set()
      this.#listeners.set(type, set)
    }
    set.add(wrapped ?? fn)
    return () => this.off(fn)
  }

  /** Remove a previously-registered listener. Pass the same function
   *  reference used with `on` / `once`. */
  off(fn: Listener): void {
    fn = this.#wrappers.get(fn) ?? fn
    for (const set of this.#listeners.values()) set.delete(fn)
  }

  protected emit(event: AgentEvent): void {
    const listeners = [
      ...(this.#listeners.get("all") ?? []),
      ...(this.#listeners.get(event.type) ?? []),
    ]
    for (const fn of listeners)
      try {
        fn(event)
      } catch (error) {
        this.onEmitError?.(error)
      }
  }
}
