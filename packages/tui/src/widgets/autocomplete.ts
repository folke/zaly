import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { Accessor, Reactive, Ref } from "../core/reactive.ts"
import type { StyleState } from "../core/state.ts"
import type { SearchItems, SearchOptions } from "../search/search.ts"
import type { Option, OptionRender, Select } from "./select.ts"

import { Node } from "../core/node.ts"
import { effect, memo, signal, unwrap } from "../core/reactive.ts"
import { Input } from "./input.ts"
import { picker } from "./picker.ts"

/** Called when the user picks `item` from this source. Return a string
 *  to insert in place of the trigger + query range, or `undefined`
 *  when the source handled the selection itself (dispatched an action,
 *  opened a modal, …) and the trigger range should just be removed. */
export type AcceptFn<T> = (item: T, query: string) => string | undefined

/** Single completion source. `triggers` are regexes run against the text
 *  *before the cursor*; the first regex whose match ends in the trailing
 *  word wins. The slice between match-end and the cursor becomes the
 *  `query` passed to `complete`.
 *
 *  `complete` receives a `match` helper bound to `query` — call it on
 *  whatever string the source considers the matching field (action id,
 *  file basename, contact email, etc.) and either filter or rank.
 *
 *  `accept` controls what happens on selection. Default: insert
 *  `item.value + " "`. Return `undefined` to have the source do its own
 *  side effect (dispatch an action, open a picker, …) and just clear
 *  the trigger range in the input.
 *
 *  `render` is forwarded to the internal `Menu` so the source can carry
 *  its own row presentation — handy when `T` isn't a plain `MenuItem`. */
export interface CompletionSource<T extends Option = Option> {
  triggers: readonly RegExp[]
  complete: Reactive<SearchItems<T>>
  accept?: AcceptFn<T>
  render?: OptionRender<T>
}

// oxlint-disable-next-line no-empty-interface
export interface AutocompleteState extends StyleState {}

export interface AutocompleteOptions extends SearchOptions {
  /** The `Input` to watch. Pass the node directly, or a `Ref<Input>`
   *  populated by `node.ref(ref)` elsewhere in the tree — the latter
   *  enables fully inline composition where the input doesn't need a
   *  local binding. The ref is dereferenced on mount, so wiring is
   *  type-safe and ordering-flexible (autocomplete can be constructed
   *  before the Input is). */
  input: Input | Ref<Input>
  // Per-source item types are erased at this level — each source
  // declares its own `T` which is preserved within its own `complete`
  // / `accept` / `render` callbacks. The `complete` event payload is
  // consequently typed as `unknown`; callers discriminate by source
  // name and cast.
  sources: Record<string, CompletionSource<any>>
  /** Cap on rows the popup shows at once. Default: 8. */
  maxHeight?: Reactive<number>
  enabled?: Reactive<boolean>
  reverse?: boolean
}

export interface AutocompleteEvents extends BaseEvents {
  /** Fired after an item is inserted into the input. Payload item type
   *  is `unknown` because sources may have different `T`; discriminate
   *  by source name and cast. */
  complete: { source: string; item: Option }
}

interface Match {
  source: string
  /** Absolute start index of the trigger in the input value. */
  start: number
  /** Absolute end index of the trigger in the input value. */
  end: number
  /** The query (text between trigger-end and cursor). */
  query: string
}

// const AutocompleteBase = Node as unknown as abstract new <T extends MenuItem>(
//   ...args: ConstructorParameters<typeof Menu<T>>
// ) => Node<MenuState<T>> & Emitter<MenuEvents<T> & EventMap>

/**
 * Autocomplete popup bound to an `Input`. Watches the input's value and
 * cursor; when one of the configured sources' trigger regexes matches
 * the text before the cursor, the source's `complete(query)` is called
 * and the resulting items are shown in a `Menu` child.
 *
 * Selecting an item replaces the matched trigger-prefix + query with
 * the item's `value` and fires `"complete"` for apps that want to react
 * beyond plain text insertion.
 *
 * ```ts
 * autocomplete({
 *   input: "chat-input",
 *   sources: {
 *     slash: {
 *       triggers: [/^\s*\//],
 *       complete: (q) => slashCommands.filter((c) => c.startsWith(q)),
 *     },
 *   },
 * }).on("complete", (src, item) => { ... })
 * ```
 *
 * Positioning is layout-based — place the `Autocomplete` in your tree
 * (typically directly above the input inside the UI footer) and it
 * takes as many rows as it has items (up to `maxHeight`). When no
 * source matches, `visible` flips to `false` and the widget takes
 * zero rows, so the footer naturally collapses.
 */
export class Autocomplete extends Node<AutocompleteState, AutocompleteEvents> {
  static readonly type = "autocomplete"
  override readonly type = Autocomplete.type

  readonly select: Select
  #opts: AutocompleteOptions
  readonly #sources: Record<string, CompletionSource<any>>
  #match: Accessor<Match | undefined>

  constructor(opts: AutocompleteOptions) {
    super({ visible: false })
    this.#opts = opts
    this.#sources = opts.sources

    const [cancelled, cancel] = signal(false)

    this.#match = memo(() => {
      const ret = this.#detect()
      if (ret) cancel(false)
      return ret
    })

    const source = memo(() => {
      const m = this.#match()
      return m ? this.#sources[m.source] : undefined
    })

    const visible = memo(
      () => this.enabled && this.#match() !== undefined && !cancelled() && this.select.count > 0
    )

    // Use an effect instead of setting a signal, since Node.show/hide overwrites the signal
    effect(() => {
      if (visible()) this.show()
      else this.hide()
    })

    this.select = picker({
      ...opts,
      items: memo(() => unwrap(source()?.complete) ?? []),
      maxHeight: opts.maxHeight ?? 8,
      pattern: memo(() => this.#match()?.query ?? ""),
      render: memo(() => source()?.render),
      visible,
    })

    this.add(this.select)
    this.select.bind(this.#opts.input)

    // Bridge menu events to input rewrite. Tab completes by inserting the
    // item's value; Enter selects, giving the source a chance to execute.
    this.select.on("complete", ({ item }) => this.#complete(item))
    this.select.on("accept", ({ item }) => this.#accept(item))
    this.select.on("cancel", () => cancel(true))
  }

  get #input(): Input | undefined {
    if (this.#opts.input instanceof Input) return this.#opts.input
    return this.#opts.input()
  }

  get enabled(): boolean {
    return unwrap(this.#opts.enabled) ?? true
  }

  #detect(): Match | undefined {
    if (!this.#input) return undefined
    const value = this.#input.state.value ?? ""
    const cursor = this.#input.state.cursor ?? 0
    const before = value.slice(0, cursor)
    for (const [name, src] of Object.entries(this.#sources)) {
      for (const rx of src.triggers) {
        // `exec` with /g wouldn't help — we want the *last* match whose
        // tail reaches the cursor, since the relevant trigger is the one
        // just typed. Scan with a sticky-ish loop and keep the latest hit.
        const re = new RegExp(rx.source, rx.flags.replace("g", ""))
        let searchFrom = 0
        let best: { start: number; end: number } | undefined
        while (searchFrom <= before.length) {
          const m = re.exec(before.slice(searchFrom))
          if (m === null) break
          const start = searchFrom + m.index
          const end = start + m[0].length
          best = { end, start }
          searchFrom = end
        }
        if (best === undefined) continue
        // The query is text from trigger-end to cursor. Reject if there's
        // whitespace between them — that means the trigger word is over.
        const query = before.slice(best.end)
        if (/\s/.test(query)) continue
        return { end: best.end, query, source: name, start: best.start }
      }
    }
    return undefined
  }

  #complete(item: Option): void {
    const match = this.#match()
    if (match === undefined) return
    // Completion keeps the trigger (`/`, `@`, ...) and only replaces the query.
    this.#replace(item, defaultAccept(item), match.end)
  }

  #accept(item: Option): void {
    const match = this.#match()
    if (match === undefined) return
    const source = this.#sources[match.source]
    // Source-provided accept wins on Enter; default is `item.value + " "` when
    // the item looks MenuItem-shaped, otherwise a no-op clear.
    this.#replace(
      item,
      source.accept ? source.accept(item, match.query) : defaultAccept(item),
      match.start
    )
  }

  #replace(item: Option, accepted: string | undefined, start: number): void {
    const match = this.#match()
    if (match === undefined || !this.#input) return
    const value = this.#input.state.value ?? ""
    const cursor = this.#input.state.cursor ?? 0
    const tail = value.slice(cursor)
    if (accepted === undefined) {
      // Source handled the selection itself (dispatched an action,
      // etc.) — just clear the selected range.
      this.#input.state.set({
        cursor: start,
        value: value.slice(0, start) + tail,
      })
    } else {
      this.#input.state.set({
        cursor: start + accepted.length,
        value: value.slice(0, start) + accepted + tail,
      })
    }
    void this.emit("complete", { item, source: match.source })
    this.hide()
  }

  protected _render(ctx: RenderCtx): string[] | Promise<string[]> {
    // Menu does all the layout. We're just a wrapper node so callers
    // can place the popup in their tree and so the `visible` toggle
    // flows through one handle.
    return this.select.render(ctx)
  }
}

/** Default `accept` fallback used when a source doesn't provide one.
 *  Assumes the item is `MenuItem`-shaped and inserts `value + " "` —
 *  matches the old `trailingSpace: true` behaviour. Returns `undefined`
 *  (clear-only) when the item has no `text`. */
function defaultAccept(item: Option): string | undefined {
  const ret = item.text
  return ret ? `${ret} ` : undefined
}

/**
 * Factory for `Autocomplete`. See the class doc for the full API.
 */
export function autocomplete(opts: AutocompleteOptions): Autocomplete {
  return new Autocomplete(opts)
}
