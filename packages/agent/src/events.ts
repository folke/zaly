import type { StreamEvent, TokenCount, ToolCallPart, ToolResult } from "@zaly/ai"

// ── Agent event map ──────────────────────────────────────────────────────

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
 *  synchronously; a throw inside a listener is caught and routed to
 *  `onEmitError` so the loop keeps running.
 *
 *  Conversation-shape events (new message committed, head moved, …)
 *  live on the `Session`, not here — subscribe via `agent.session.on(…)`. */
export type AgentEvents = {
  status: { status: AgentStatus }
  "stream-event": { event: StreamEvent }
  "tool-call": { call: ToolCallPart }
  "tool-result": { call: ToolCallPart; result: ToolResult }
  "step-end": { outcome: StepKind }
  stop: { reason: AgentStopReason; usage: TokenCount }
}

// ── Emitter ──────────────────────────────────────────────────────────────

/** Constraint for event maps — a record of `{ name: payload }` entries.
 *  The name keys the dispatch table, the payload is a spreadable object
 *  (use `{}` for events that carry no data). No discriminator required
 *  on the payload — the name IS the discriminator, supplied at
 *  emit/listen time. */
export type EventMap = Record<string, Record<string, unknown>>

/** Conditional rest params for `emit`: when the payload type has no
 *  keys (declared as `{}`), the second arg can be omitted —
 *  `emit("ready")` instead of `emit("ready", {})`. Events with data
 *  still require the arg. */
type EmitArgs<E> = keyof E extends never ? [] : [event: E]

/** Listener for one event type. Receives the payload and the emitter
 *  instance (typed as `Self`, the polymorphic `this` of the class) so
 *  handlers can chain, mutate, or unsubscribe without closing over a
 *  separate reference. */
export type Listener<E, Self> = (event: E, self: Self) => void

/** Per-key event envelope — the payload plus its discriminator. This is
 *  the shape every listener receives, both typed and wildcard. */
export type EventOf<T extends EventMap, K extends keyof T & string> = { type: K } & T[K]

/** Tagged union of every event in the map. `.all(fn)` listeners get
 *  this; typed listeners get the per-key narrow form via `EventOf`. */
export type Envelope<T extends EventMap> = { [K in keyof T & string]: EventOf<T, K> }[keyof T &
  string]

type AnyListener = Listener<unknown, unknown>

/** Tiny typed event emitter, indexed by event name.
 *
 *  Three properties make this safe to extend in subclasses:
 *
 *  1. Method syntax everywhere — TS applies *method bivariance*, which
 *     softens parameter contravariance. `Emitter<MyEvents>` and
 *     `Emitter<BaseEvents>` then play nicely as bases for subclassing
 *     even when `MyEvents` widens `BaseEvents`.
 *
 *  2. The generic `T` only appears in parameter positions — never in a
 *     return type. Combined with method bivariance, subclass narrowing
 *     of `T` works without variance gymnastics.
 *
 *  3. Polymorphic `this` flows through `on()`'s return and the
 *     listener's second arg. `on()` chains preserve subclass identity;
 *     listener bodies can call subclass methods on `self` without
 *     casting.
 *
 *  Listener throws are caught and surfaced via `onEmitError` (silent
 *  if unset) so a buggy subscriber never takes down the emitter loop.
 *
 *  Wildcard subscriptions go through `.all(fn)` — those receive a
 *  synthesized `{ type, ...payload }` envelope and fire *before* typed
 *  listeners on every emit, in registration order within the wildcard
 *  bucket. */
export class Emitter<T extends EventMap = EventMap> {
  readonly #listeners = new Map<string, AnyListener[]>([["all", []]])
  readonly #wrappers = new WeakMap<AnyListener, AnyListener>()
  onEmitError?: (error: unknown) => void

  on<K extends keyof T & string>(type: K, fn: Listener<EventOf<T, K>, this>): this {
    return this.#add(type, fn as AnyListener)
  }

  once<K extends keyof T & string>(type: K, fn: Listener<EventOf<T, K>, this>): this {
    const wrapped: AnyListener = (event, self) => {
      this.off(type, fn)
      fn(event as EventOf<T, K>, self as this)
    }
    this.#wrappers.set(fn as AnyListener, wrapped)
    return this.#add(type, wrapped)
  }

  /** Remove a previously-registered listener. Two forms:
   *
   *    off(type, fn)  // typed — undoes `on(type, fn)` / `once(type, fn)`
   *    off(fn)        // wildcard — undoes `all(fn)`
   *
   *  Pass the same function reference used with the original
   *  registration. */
  off<K extends keyof T & string>(type: K, fn: Listener<EventOf<T, K>, this>): this
  off(fn: Listener<Envelope<T>, this>): this
  // Implementation signature — wider than the public overloads so the
  // typed listener positions remain assignable. Internal callers should
  // go through one of the typed overloads.
  off(typeOrFn: string | Listener<any, this>, fn?: Listener<any, this>): this {
    const bucket = typeof typeOrFn === "string" ? typeOrFn : "all"
    const handler = (typeof typeOrFn === "string" ? fn : typeOrFn) as AnyListener
    const list = this.#listeners.get(bucket)
    if (!list) return this
    const target = this.#wrappers.get(handler) ?? handler
    const idx = list.indexOf(target)
    if (idx === -1) return this
    list.splice(idx, 1)
    if (list.length === 0 && bucket !== "all") this.#listeners.delete(bucket)
    return this
  }

  /** Subscribe to every event. The listener receives a tagged-union
   *  `{ type, ...payload }` envelope synthesized at dispatch time.
   *  Useful for logging, replay, or policy state machines that switch
   *  on `event.type`.
   *
   *  Returns an unsubscribe function — wildcard subscriptions don't
   *  share the typed `off()` API, since they have a different listener
   *  shape. */
  all(fn: Listener<Envelope<T>, this>): this {
    return this.#add("all", fn as AnyListener)
  }

  emit<K extends keyof T & string>(type: K, ...args: EmitArgs<T[K]>): void {
    const all = this.#listeners.get("all") ?? []
    const typed = this.#listeners.get(type) ?? []
    if (all.length === 0 && typed.length === 0) return

    // Single envelope for both typed and wildcard listeners.
    // `args[0]` is undefined for empty-payload events — synthesize a
    // bare object so spread always works.
    const event = { type, ...((args[0] ?? {}) as T[K]) } as EventOf<T, K>

    // Wildcards first, in registration order; then typed listeners.
    // Snapshot each list so mutations during iteration don't affect
    // this dispatch.
    for (const fn of [...all, ...typed])
      try {
        fn(event as unknown, this as unknown)
      } catch (error) {
        this.onEmitError?.(error)
      }
  }

  /** Append a listener to a bucket, creating the bucket on demand.
   *  Returns `this` so callers can chain. */
  #add(bucket: string, fn: AnyListener): this {
    const list = this.#listeners.get(bucket)
    if (list) list.push(fn)
    else this.#listeners.set(bucket, [fn])
    return this
  }
}
