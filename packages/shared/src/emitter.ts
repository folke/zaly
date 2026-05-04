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
export type Listener<E, Self, R extends void | Promise<void> = void> = (event: E, self: Self) => R

/** Per-key event envelope — the payload plus its discriminator. This is
 *  the shape every listener receives, both typed and wildcard. */
export type EventOf<T extends EventMap, K extends keyof T & string> = { type: K } & T[K]

/** Tagged union of every event in the map. `.all(fn)` listeners get
 *  this; typed listeners get the per-key narrow form via `EventOf`. */
export type Envelope<T extends EventMap> = { [K in keyof T & string]: EventOf<T, K> }[keyof T &
  string]

type AnyListener<T extends void | Promise<void> = void> = Listener<unknown, unknown, T>

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
class BaseEmitter<T extends EventMap = EventMap, R extends void | Promise<void> = void> {
  readonly #listeners = new Map<string, AnyListener<R>[]>([["all", []]])
  readonly #wrappers = new WeakMap<AnyListener<R>, AnyListener<R>>()
  onEmitError?: (error: unknown) => void

  on<K extends keyof T & string>(type: K, fn: Listener<EventOf<T, K>, this, R>): this {
    return this.#add(type, fn as AnyListener<R>)
  }

  once<K extends keyof T & string>(type: K, fn: Listener<EventOf<T, K>, this, R>): this {
    const wrapped = ((event, self) => {
      this.off(type, fn)
      return fn(event as EventOf<T, K>, self as this)
    }) as AnyListener<R>
    this.#wrappers.set(fn as AnyListener<R>, wrapped)
    return this.#add(type, wrapped)
  }

  /** Remove a previously-registered listener. Two forms:
   *
   *    off(type, fn)  // typed — undoes `on(type, fn)` / `once(type, fn)`
   *    off(fn)        // wildcard — undoes `all(fn)`
   *
   *  Pass the same function reference used with the original
   *  registration. */
  off<K extends keyof T & string>(type: K, fn: Listener<EventOf<T, K>, this, R>): this
  off(fn: Listener<Envelope<T>, this, R>): this
  // Implementation signature — wider than the public overloads so the
  // typed listener positions remain assignable. Internal callers should
  // go through one of the typed overloads.
  off(typeOrFn: string | Listener<any, this, R>, fn?: Listener<any, this, R>): this {
    const bucket = typeof typeOrFn === "string" ? typeOrFn : "all"
    const handler = (typeof typeOrFn === "string" ? fn : typeOrFn) as AnyListener<R>
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
   *  on `event.type`. */
  all(fn: Listener<Envelope<T>, this, R>): this {
    return this.#add("all", fn as AnyListener<R>)
  }

  emit<K extends keyof T & string>(type: K, ...args: EmitArgs<T[K]>): R {
    const all = this.#listeners.get("all") ?? []
    const typed = this.#listeners.get(type) ?? []
    if (all.length === 0 && typed.length === 0) return undefined as R

    const event = { type, ...((args[0] ?? {}) as T[K]) } as EventOf<T, K>
    const todo = [...all, ...typed]

    // Run sync listeners in line until we hit an async one. From there,
    // await sequentially. For sync-only emitters, listeners never return
    // Promises, so the async branch never triggers — zero overhead.
    for (let i = 0; i < todo.length; i++) {
      let r: unknown
      try {
        r = todo[i](event as unknown, this as unknown)
      } catch (error) {
        this.onEmitError?.(error)
        continue
      }
      if (r instanceof Promise) {
        const rest = todo.slice(i + 1)
        return (async () => {
          await r.catch((error) => this.onEmitError?.(error))
          for (const fn of rest) {
            try {
              const next = fn(event as unknown, this as unknown)
              if (next instanceof Promise)
                // oxlint-disable-next-line no-await-in-loop
                await next.catch((error) => this.onEmitError?.(error))
            } catch (error) {
              this.onEmitError?.(error)
            }
          }
        })() as R
      }
    }
    return undefined as R
  }

  /** Append a listener to a bucket, creating the bucket on demand.
   *  Returns `this` so callers can chain. */
  #add(bucket: string, fn: AnyListener<R>): this {
    const list = this.#listeners.get(bucket)
    if (list) list.push(fn)
    else this.#listeners.set(bucket, [fn])
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

/** Type gymnastics to get a single class with multiple generic event maps. The
 * base class only has one generic param, so we intersect multiple instances
 * to get the full set of event types. The `Emitter` constructor is then
 * typed to produce the intersection. */
export const AsyncEmitter = BaseEmitter as new <
  A extends EventMap = never,
  B extends EventMap = never,
  C extends EventMap = never,
  D extends EventMap = never,
>() => AsyncEmitter<A, B, C, D>
export type AsyncEmitter<
  A extends EventMap = never,
  B extends EventMap = never,
  C extends EventMap = never,
  D extends EventMap = never,
> = InstanceType<typeof BaseEmitter<A, Promise<void>>> &
  InstanceType<typeof BaseEmitter<B, Promise<void>>> &
  InstanceType<typeof BaseEmitter<C, Promise<void>>> &
  InstanceType<typeof BaseEmitter<D, Promise<void>>>
