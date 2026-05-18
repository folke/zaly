// ── Emitter ──────────────────────────────────────────────────────────────

/** Constraint for event maps — a record of `{ name: payload }` entries.
 *  The name keys the dispatch table, the payload is a spreadable object
 *  (use `{}` for events that carry no data). No discriminator required
 *  on the payload — the name IS the discriminator, supplied at
 *  emit/listen time. */
export type EventMap = Record<string, Record<string, unknown> | { signal?: AbortSignal }>

/** Conditional rest params for `emit`: when the payload type has no
 *  keys (declared as `{}`), the second arg can be omitted —
 *  `emit("ready")` instead of `emit("ready", {})`. Events with data
 *  still require the arg. */
type EmitArgs<E> = keyof E extends never ? [] : [event: E]

/** Listener for one event type. Receives the payload and the emitter
 *  instance (typed as `Self`, the polymorphic `this` of the class) so
 *  handlers can chain, mutate, or unsubscribe without closing over a
 *  separate reference. */
export type Listener<E, Self> = (event: E, self: Self, ctx: ListenerCtx) => unknown

export type ListenerCtx = {
  /** Signal that aborts when the current listener chain should stop */
  signal: AbortSignal
  /** Abort the current listener chain with an optional reason */
  abort(reason?: unknown): void
}

export type ListenerOpts = {
  /** Optional signal to tie the listener's lifetime to. When the signal
   * aborts, the listener is removed as if by `off()`.*/
  signal?: AbortSignal
}

/** Per-key event envelope — the payload plus its discriminator. This is
 *  the shape every listener receives, both typed and wildcard. */
export type EventOf<T extends EventMap, K extends keyof T & string> = { type: K } & T[K]

/** Tagged union of every event in the map. `.onAny(fn)` listeners get
 *  this; typed listeners get the per-key narrow form via `EventOf`. */
export type Envelope<T extends EventMap> = { [K in keyof T & string]: EventOf<T, K> }[keyof T &
  string]

type AnyListener = Listener<unknown, unknown>

const ANY = Symbol("any")

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
 *  Wildcard subscriptions go through `.onAny(fn)` — those receive a
 *  synthesized `{ type, ...payload }` envelope and fire *before* typed
 *  listeners on every emit, in registration order within the wildcard
 *  bucket. */
class BaseEmitter<T extends EventMap = EventMap> {
  readonly #listeners = new Map<string | symbol, Set<AnyListener>>()
  readonly #wrappers = new WeakMap<AnyListener, AnyListener>()
  onEmitError?: (error: unknown) => void

  #bindSignal(signal: AbortSignal | undefined, onAbort: () => void): boolean {
    if (!signal) return true
    if (signal.aborted) return false
    signal.addEventListener("abort", onAbort, { once: true })
    return true
  }

  clearListeners(events?: (keyof T & string)[]): this {
    if (events) {
      for (const event of events) this.#listeners.delete(event)
    } else {
      this.#listeners.clear()
    }
    return this
  }

  on<K extends keyof T & string>(
    type: K,
    fn: Listener<EventOf<T, K>, this>,
    opts?: ListenerOpts
  ): this {
    if (!this.#bindSignal(opts?.signal, () => this.off(type, fn))) return this
    this.#add(type, fn as AnyListener)
    return this
  }

  once<K extends keyof T & string>(
    type: K,
    fn: Listener<EventOf<T, K>, this>,
    opts?: ListenerOpts
  ): this {
    if (!this.#bindSignal(opts?.signal, () => this.off(type, fn))) return this
    const wrapped = ((event, self, ctx) => {
      this.off(type, fn)
      return fn(event as EventOf<T, K>, self as this, ctx)
    }) as AnyListener
    this.#wrappers.set(fn as AnyListener, wrapped)
    return this.#add(type, wrapped)
  }

  /** Remove a previously-registered listener
   *
   *    off(type, fn)  // typed — undoes `on(type, fn)` / `once(type, fn)`
   *
   *  Pass the same function reference used with the original
   *  registration. */
  off<K extends keyof T & string>(type: K, fn: Listener<EventOf<T, K>, this>): this {
    return this.#delete(type, fn as AnyListener)
  }

  /** Subscribe to every event. The listener receives a tagged-union
   *  `{ type, ...payload }` envelope synthesized at dispatch time.
   *  Useful for logging, replay, or policy state machines that switch
   *  on `event.type`. */
  onAny(fn: Listener<Envelope<T>, this>, opts?: ListenerOpts): this {
    if (!this.#bindSignal(opts?.signal, () => this.offAny(fn))) return this
    return this.#add(ANY, fn as AnyListener)
  }

  offAny(fn: Listener<Envelope<T>, this>): this {
    return this.#delete(ANY, fn as AnyListener)
  }

  /** Returns `true` if all listeners completed without abort, `false` if
   *  any listener called `ctx.abort()` or the event's `signal` aborted. */
  emit<K extends keyof T & string>(type: K, ...args: EmitArgs<T[K]>) {
    return this.#emit(type, { serial: false }, ...args)
  }

  /** Returns `true` if all listeners completed without abort, `false` if
   *  any listener called `ctx.abort()` or the event's `signal` aborted. */
  emitSerial<K extends keyof T & string>(type: K, ...args: EmitArgs<T[K]>) {
    return this.#emit(type, { serial: true }, ...args)
  }

  async #emit<K extends keyof T & string>(
    type: K,
    opts: { serial?: boolean } = {},
    ...args: EmitArgs<T[K]>
  ): Promise<boolean> {
    const todo = [...(this.#listeners.get(ANY) ?? []), ...(this.#listeners.get(type) ?? [])]
    if (!todo.length) return true

    const event = (args[0] ?? {}) as T[K] as EventOf<T, K>
    event.type = type
    const outer = (event as { signal?: AbortSignal }).signal
    if (outer?.aborted) return false

    const ctrl = new AbortController()
    const signal = outer ? AbortSignal.any([outer, ctrl.signal]) : ctrl.signal
    const ctx: ListenerCtx = { abort: (r) => ctrl.abort(r), signal }

    const run = async (fn: AnyListener) => {
      try {
        await fn(event, this, ctx)
      } catch (error) {
        this.onEmitError?.(error)
      }
    }

    if (!opts.serial) {
      await Promise.all(todo.map(run))
      return !signal.aborted
    }

    for (const fn of todo) {
      if (signal.aborted) break
      // oxlint-disable-next-line no-await-in-loop
      await run(fn)
    }
    return !signal.aborted
  }

  /** Append a listener to a bucket, creating the bucket on demand.
   *  Returns `this` so callers can chain. */
  #add(bucket: string | symbol, fn: AnyListener): this {
    const list = this.#listeners.get(bucket)
    if (list) list.add(fn)
    else this.#listeners.set(bucket, new Set([fn]))
    return this
  }

  #delete(bucket: string | symbol, fn: AnyListener): this {
    const list = this.#listeners.get(bucket)
    if (!list) return this
    const target = this.#wrappers.get(fn) ?? fn
    list.delete(target)
    if (list.size === 0 && bucket !== ANY) this.#listeners.delete(bucket)
    return this
  }
}

/** Type gymnastics to get a single class with multiple generic event maps. The
 * base class only has one generic param, so we intersect multiple instances
 * to get the full set of event types. The `Emitter` constructor is then
 * typed to produce the intersection. */
export const Emitter = BaseEmitter as new <
  A extends EventMap = never,
  B extends EventMap = never,
  C extends EventMap = never,
  D extends EventMap = never,
>() => Emitter<A, B, C, D>
export type Emitter<
  A extends EventMap = never,
  B extends EventMap = never,
  C extends EventMap = never,
  D extends EventMap = never,
> = InstanceType<typeof BaseEmitter<A>> &
  InstanceType<typeof BaseEmitter<B>> &
  InstanceType<typeof BaseEmitter<C>> &
  InstanceType<typeof BaseEmitter<D>>
