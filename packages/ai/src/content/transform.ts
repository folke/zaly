import type { ContentPart } from "../types.ts"

/**
 * Composable content-transform pipeline.
 *
 * `ContentTransform<T>` is a lazy, immutable builder that records a
 * sequence of stages and runs them in order against a `ContentPart[]`.
 * Each chaining method returns a *new* instance whose `T` reflects
 * what the pipeline can produce after that stage:
 *
 *   - `drop(kind)`     narrows: `Exclude<T, { type: kind }>`
 *   - `map(kind, fn)`  narrows by `kind`, widens by the fn's return type
 *   - `rewrite(fn)`    leaves `T` untouched (cross-part operations)
 *
 * The chain therefore *is* the type-level documentation: reading it
 * tells you exactly which part kinds the output may contain.
 *
 * ```ts
 * const cleanForWire = ContentTransform.create()
 *   .map("error", (e) => ({ type: "meta", tag: "error", data: e }))
 *   .drop("audio")
 *   .drop("video")
 * // type of `cleanForWire`:
 * //   ContentTransform<Exclude<ContentPart, { type: "error"|"audio"|"video" }> | MetaPart>
 *
 * const cleaned = await cleanForWire.run(message.content as ContentPart[])
 * ```
 *
 * Build once, run many: `cleanForWire` is a value; you can pass it
 * around, compose it with other pipelines (see `extend`), and apply
 * it to any number of content arrays.
 */
export class ContentTransform<T extends ContentPart = ContentPart> {
  readonly #stages: readonly Stage[]

  private constructor(stages: readonly Stage[] = []) {
    this.#stages = stages
  }

  /** Empty pipeline — start chaining from here. */
  static create(): ContentTransform {
    return new ContentTransform()
  }

  /** Drop every part of `kind`. The output type narrows to exclude
   *  that variant. Use for "this provider doesn't accept audio" or
   *  "strip diagnostic ErrorParts before sending to the model". */
  drop<K extends T["type"]>(kind: K): ContentTransform<Exclude<T, { type: K }>> {
    return this.#stage((parts) => parts.filter((p) => p.type !== kind))
  }

  /** Replace each part of `kind` with the result of `fn`. The function
   *  may return:
   *    - a single `R` part (1:1 substitution),
   *    - an `R[]` (1:N — e.g. an error part splits into a marker + diagnostic),
   *    - `undefined` (drop the part).
   *
   *  The output type narrows by removing `K` and widens by the
   *  function's return type `R`. Returning `T` itself (e.g. an
   *  unchanged variant) is fine — `R` then includes `T` and the type
   *  doesn't actually narrow.
   *
   *  ```ts
   *  ct.map("image", (img) =>
   *    img.source.type === "url" ? img : compressed(img)
   *  )
   *  ``` */
  map<K extends T["type"], R extends ContentPart>(
    kind: K,
    fn: (part: Extract<T, { type: K }>) => R | readonly R[] | undefined
  ): ContentTransform<Exclude<T, { type: K }> | R> {
    return this.#stage((parts) =>
      parts.flatMap((p) => {
        if (p.type !== kind) return [p]
        const r = fn(p as Extract<T, { type: K }>)
        if (r === undefined) return []
        return Array.isArray(r) ? r : [r as R]
      })
    )
  }

  /** Async variant of `map` for I/O-bound transforms (image resize,
   *  network fetch, format conversion). Stages run sequentially via
   *  the runner's `await` — earlier stages fully complete before
   *  later stages start. */
  mapAsync<K extends T["type"], R extends ContentPart>(
    kind: K,
    fn: (part: Extract<T, { type: K }>) => Promise<R | readonly R[] | undefined>
  ): ContentTransform<Exclude<T, { type: K }> | R> {
    return this.#stage(async (parts) => {
      const out: ContentPart[] = []
      for (const p of parts) {
        if (p.type !== kind) {
          out.push(p)
          continue
        }
        // Sequential by design — keeps memory bounded when stages
        // decode/encode large attachments. Callers who want
        // concurrency can write their own `rewrite` stage with
        // `Promise.all`.
        // eslint-disable-next-line no-await-in-loop
        const r = await fn(p as Extract<T, { type: K }>)
        if (r === undefined) continue
        if (Array.isArray(r)) out.push(...r)
        else out.push(r as R)
      }
      return out
    })
  }

  /** Rewrite the entire part array. Useful for cross-part decisions
   *  ("if total bytes > limit, drop the largest image", "merge
   *  adjacent text parts", "deduplicate identical attachments"). The
   *  output type is unchanged — declare any narrowing/widening
   *  through `drop`/`mapPart` instead. */
  rewrite(fn: (parts: T[]) => T[] | Promise<T[]>): ContentTransform<T> {
    return this.#stage((parts) => fn(parts as T[]) as ContentPart[] | Promise<ContentPart[]>)
  }

  /** Append every stage from `other` to this pipeline. The combined
   *  output type is whatever `other` last narrowed/widened to. Use
   *  for splitting concerns: a base pipeline plus a per-provider tail.
   *
   *  Caveat: `extend` doesn't preserve cross-step narrowing. `other`
   *  was built starting from `ContentPart` (the typical helper shape),
   *  so its `U` doesn't reflect what *this* chain narrowed. For
   *  composition that tracks narrowing through helpers, use `pipe`. */
  extend<U extends ContentPart>(other: ContentTransform<U>): ContentTransform<U> {
    return new ContentTransform<U>([...this.#stages, ...other.#stages])
  }

  /** Apply a polymorphic transformation step. Unlike `extend`, the
   *  step is a *function* of the current chain, so it can see the
   *  chain's narrowed `T` and produce a narrowed output `U`. This is
   *  the right primitive for helpers that compose narrowing — TS
   *  infers `T` at the call site and `U` falls out of the step's body.
   *
   *  ```ts
   *  ct.pipe(errorToMeta())          // helper returning a step fn
   *    .pipe(attachmentToMeta("audio"))
   *  ``` */
  pipe<U extends ContentPart>(
    step: (ct: ContentTransform<T>) => ContentTransform<U>
  ): ContentTransform<U> {
    return step(this)
  }

  /** Run all stages against `content`, returning the transformed
   *  array. Stages execute sequentially; the output of stage `i`
   *  becomes the input of stage `i + 1`.
   *
   *  Input is the wide `ContentPart[]` — pipelines accept arbitrary
   *  content. The chain's narrowing applies to the *output* (`T`),
   *  not the input: dropping `image` doesn't mean callers can't feed
   *  images, just that images won't appear in the result. */
  async run(content: readonly ContentPart[]): Promise<T[]> {
    let parts: ContentPart[] = [...content]
    for (const stage of this.#stages) {
      // Sequential — each stage feeds the next.
      // eslint-disable-next-line no-await-in-loop
      parts = await stage(parts)
    }
    return parts as T[]
  }

  /** Synchronous variant of `run`. Throws if any stage returns a
   *  Promise — caller's responsibility to only use this on pipelines
   *  built from sync primitives (`drop`, `map`, sync `rewrite`).
   *
   *  Useful for sync flatten paths like `stringifyContent` that can't
   *  afford to be async. The runtime guard keeps the contract honest:
   *  swapping in an async stage will fail loudly instead of returning
   *  a `Promise` that callers silently stringify as `[object Promise]`. */
  runSync(content: readonly ContentPart[]): T[] {
    let parts: ContentPart[] = [...content]
    for (const stage of this.#stages) {
      const result = stage(parts)
      if (result instanceof Promise) {
        throw new Error(
          "ContentTransform.runSync called on a pipeline with async stages — use run()"
        )
      }
      parts = result
    }
    return parts as T[]
  }

  // Append a stage; returns a new instance with a (possibly) different
  // type parameter. The cast is safe because the runtime stage shape
  // doesn't depend on `T` — only the static signatures of the public
  // chain methods enforce the correct union.
  #stage<U extends ContentPart>(fn: Stage): ContentTransform<U> {
    return new ContentTransform<U>([...this.#stages, fn])
  }
}

export function createTransform<T extends ContentPart = ContentPart>(): ContentTransform<T> {
  return ContentTransform.create() as ContentTransform<T>
}

type Stage = (parts: ContentPart[]) => ContentPart[] | Promise<ContentPart[]>
