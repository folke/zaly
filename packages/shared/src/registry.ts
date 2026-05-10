// ── Generic registry ─────────────────────────────────────────────────────
//
// A typed name → loader map. The registry doesn't manage lifetime —
// that's a property of the loader. A `() => value` is naturally a
// singleton; a `(opts) => createX(opts)` is a factory; an
// `() => import(...)` is module-cached by the runtime.
//
// Async-or-not is also a loader concern, encoded in `V`:
//
//   createRegistry<Tool>("tool")             // sync — load() returns Tool
//   createRegistry<Promise<Tool>>("tool")    // async — load() returns Promise<Tool>
//
// The registry never awaits. Callers `await` if and only if their `V`
// is a Promise. This keeps the type signatures honest and avoids the
// `V | Promise<V>` ergonomic union that would otherwise leak everywhere.
//
//   V — the loaded value's type (wrap in `Promise<…>` for async loaders)
//   O — the load-time options type; defaults to `void` so `load(name)`
//       works without an opts arg for value-shaped registries
//   I — the literal type of the builtin loader map; preserves per-key
//       narrow types so `load("bash")` returns `Tool<bash params>`
//       rather than the union V

export type Loader<V, O = void> = (opts: O) => V
export type LoaderMap<V, O = void> = Record<string, Loader<V, O>>

/** Pulls the resolved value out of a loader. */
export type Resolved<L> = L extends Loader<infer V, infer _O> ? V : never

/** When `O` is `void` the opts arg is omittable, so `load("bash")`
 *  works. Otherwise it's required: `load("anthropic", opts)`. */
type LoadArgs<O> = [O] extends [void] ? [] : [opts: O]

export class Registry<V, O = void, I extends LoaderMap<V, O> = LoaderMap<V, O>> {
  readonly #label: string
  readonly #entries = new Map<string, Loader<V, O>>()

  constructor(label: string) {
    this.#label = label
  }

  /** Resolve a loader by name. The `(keyof I & string) | (string & {})`
   *  pattern surfaces builtin keys in autocomplete while still accepting
   *  any string for runtime-registered entries. The conditional return
   *  type narrows to the per-key loader's value when the name is a
   *  builtin, falls back to `V` otherwise. */
  load<N extends (keyof I & string) | (string & {})>(
    name: N,
    ...args: LoadArgs<O>
  ): N extends keyof I ? Resolved<I[N]> : V
  // Implementation signature — wider than the public overload so the
  // conditional return type compiles. Internal callers should go
  // through the typed signature.
  load(name: string, ...args: LoadArgs<O>): unknown {
    const opts = args[0] as O
    const loader = this.#entries.get(name)
    if (!loader) {
      const known = [...this.#entries.keys()].toSorted().join(", ")
      throw new Error(`Unknown ${this.#label} "${name}". Registered: ${known || "(none)"}.`)
    }
    return loader(opts)
  }

  /** Add (or replace) a loader. Returns an unregister function — only
   *  removes the entry if it's still ours, so a later replacement
   *  isn't accidentally undone. */
  register(name: string, loader: Loader<V, O>): () => void {
    this.#entries.set(name, loader)
    return () => {
      if (this.#entries.get(name) === loader) this.#entries.delete(name)
    }
  }

  has(name: string): boolean {
    return this.#entries.has(name)
  }

  keys(): string[] {
    return [...this.#entries.keys()].toSorted()
  }

  /** Bulk-register a literal map of entries. The `const E` modifier and
   *  splitting this from `createRegistry` (so `E` is the only generic
   *  needing inference at this call site) is what preserves the
   *  per-key narrow types in `I`. */
  from<const E extends LoaderMap<V, O>>(entries: E): Registry<V, O, E> {
    for (const [name, loader] of Object.entries(entries)) this.#entries.set(name, loader)
    return this as Registry<V, O, E>
  }
}

/** Builder entry point — locks `V` (and optionally `O`) so the
 *  subsequent `.from(builtin)` can infer `I` narrowly without competing
 *  generic defaults.
 *
 *  Usage:
 *    const tools = createRegistry<Promise<Tool>>("tool").from(builtin)
 *    const handlers = createRegistry<PermissionHandler>("scope").from(handlerMap)
 *    const provs = createRegistry<Promise<Provider>, ProviderOptions>("provider").from(providerMap) */
export function createRegistry<V, O = void>(label: string): Registry<V, O> {
  return new Registry<V, O>(label)
}
