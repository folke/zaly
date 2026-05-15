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

export type Loader = (args?: any) => any
export type LoaderMap<L extends Loader> = Record<string, L>

/** When `O` is `void` the opts arg is omittable, so `load("bash")`
 *  works. Otherwise it's required: `load("anthropic", opts)`. */
type LoadArgs<L extends Loader> = [Parameters<L>[0]] extends [void] ? [] : [opts: Parameters<L>[0]]

type AnyRegKey<I extends LoaderMap<any>> = (keyof I & string) | (string & {})
export type AnyKey<T extends string> = T | (string & {})

class Registry<L extends Loader, I extends LoaderMap<L> = LoaderMap<L>> {
  readonly #label: string
  readonly #entries = new Map<string, L>()

  constructor(label: string) {
    this.#label = label
  }

  /** Resolve a loader by name. The `(keyof I & string) | (string & {})`
   *  pattern surfaces builtin keys in autocomplete while still accepting
   *  any string for runtime-registered entries. The conditional return
   *  type narrows to the per-key loader's value when the name is a
   *  builtin, falls back to `V` otherwise. */
  load<N extends keyof I>(name: N, ...args: LoadArgs<L>): ReturnType<I[N]>
  load(name: string, ...args: LoadArgs<L>): ReturnType<L>
  // Implementation signature — wider than the public overload so the
  // conditional return type compiles. Internal callers should go
  // through the typed signature.
  load(name: string, ...args: LoadArgs<L>): unknown {
    const opts = args[0] as LoadArgs<L>[0]
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
  register(name: string, loader: L): () => void {
    const prev = this.#entries.get(name)
    this.#entries.set(name, loader)
    return () => {
      if (this.#entries.get(name) !== loader) return
      if (prev !== undefined) this.#entries.set(name, prev)
      else this.#entries.delete(name)
    }
  }

  has(name: AnyRegKey<I>): boolean {
    return this.#entries.has(name)
  }

  keys(): AnyRegKey<I>[] {
    return [...this.#entries.keys()]
  }

  /** Bulk-register a literal map of entries. The `const E` modifier and
   *  splitting this from `createRegistry` (so `E` is the only generic
   *  needing inference at this call site) is what preserves the
   *  per-key narrow types in `I`. */
  from<const E extends LoaderMap<L>>(entries: E): Registry<L, E> {
    for (const [name, loader] of Object.entries(entries)) this.#entries.set(name, loader)
    return this as Registry<L, E>
  }
}

/** Builder entry point — locks the loader signature `L` so the
 *  subsequent `.from(builtin)` can infer `I` narrowly without competing
 *  generic defaults.
 *
 *  Usage:
 *    const tools = createRegistry<(init: ToolInit) => Promise<Tool>>("tool").from(builtin)
 *    const handlers = createRegistry<() => PermissionHandler>("scope").from(handlerMap)
 *    const provs = createRegistry<(opts: ProviderOptions) => Promise<Provider>>("provider").from(providerMap) */
export function createRegistry<L extends Loader>(label: string): Registry<L> {
  return new Registry<L>(label)
}
