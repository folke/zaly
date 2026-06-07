import type { MaybePromise } from "@zaly/shared"
import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { Reactive, Ref } from "../core/reactive.ts"
import type { StyleState } from "../core/state.ts"
import type { Option, OptionRender } from "./select.ts"

import { Node } from "../core/node.ts"
import { effect, unwrap } from "../core/reactive.ts"
import { fuzzyScore } from "./completions/fuzzy.ts"
import { Input } from "./input.ts"
import { Select } from "./select.ts"

export type CompleteResult<T extends Option = Option> = MaybePromise<readonly T[]>

/** Match function handed to `complete`. Returns `0` for no match,
 *  positive integer otherwise — so both `match(s) > 0` and the
 *  idiomatic `.filter(match(s))` work (0 is falsy). The magnitude is a
 *  score the source can use to rank its own candidates when it cares
 *  about order. */
export type Matcher = (s: string) => number

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
  complete: (query: string, match: Matcher) => CompleteResult<T>
  accept?: AcceptFn<T>
  render?: OptionRender<T>
}

// oxlint-disable-next-line no-empty-interface
export interface AutocompleteState extends StyleState {}

export interface AutocompleteOptions {
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
  maxHeight?: number
  enabled?: Reactive<boolean>
}

export interface AutocompleteEvents extends BaseEvents {
  open: {}
  close: {}
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
  readonly #inputRef: Input | Ref<Input>
  readonly #sources: Record<string, CompletionSource<any>>
  #input?: Input
  #match: Match | undefined
  #cancelled = false
  /** Increments each time a refresh starts, so an in-flight async
   *  `complete()` can notice it's been superseded and bail before
   *  writing stale items. */
  #refreshSeq = 0
  #enabled?: Reactive<boolean>

  constructor(opts: AutocompleteOptions) {
    super({ visible: false })
    this.#inputRef = opts.input
    this.#enabled = opts.enabled
    this.#sources = opts.sources

    this.select = new Select({
      items: [] as Option[],
      maxHeight: opts.maxHeight ?? 8,
      sticky: false,
    })
    this.add(this.select)
    this.select.bind(this.#inputRef)

    // If a concrete Input is passed, wire immediately so the widget
    // works without a mount step (tests, standalone usage). Refs
    // resolve on mount — by then the Input has been constructed and
    // wired via `node.ref(ref)`.
    if (this.#inputRef instanceof Input) this.#bindInput(this.#inputRef)

    // Bridge menu events to input rewrite. Tab completes by inserting the
    // item's value; Enter selects, giving the source a chance to execute.
    this.select.on("complete", ({ item }) => {
      this.#complete(item)
    })
    this.select.on("accept", ({ item }) => {
      this.#accept(item)
    })
    this.select.on("cancel", () => {
      this.#cancelled = true
      this.#close()
    })

    this.on("mount", () => {
      if (this.#input === undefined && !(this.#inputRef instanceof Input)) {
        // Ref dereferences via `.value`, which throws if it hasn't been
        // wired by a `node.ref(ref)` call on an `Input` somewhere in
        // the tree. Surface that as a clearer message.
        try {
          this.#bindInput(this.#inputRef.value)
        } catch {
          throw new Error("autocomplete: input Ref was not wired before mount")
        }
      }
    })

    effect(() => {
      if (!this.enabled) {
        this.#close()
      } else {
        void this.#refresh()
      }
    })
  }

  get enabled(): boolean {
    return unwrap(this.#enabled ?? true)
  }

  /** Whether the popup is currently showing. */
  get open(): boolean {
    return this.state.visible === true
  }

  #bindInput(node: Input): void {
    this.#input = node
    // Re-evaluate whenever the bound input mutates. `invalidate` fires
    // on every state write, so this is the single hook we need. The
    // refresh kicks off synchronously; any async `complete(query)` adds
    // its own microtask, and the `#refreshSeq` guard prevents a slow
    // response from overwriting newer state.
    node.on(
      "invalidate",
      (): void => {
        void this.try(() => this.#refresh())
      },
      { signal: this.mountSignal }
    )
  }

  async #refresh(): Promise<void> {
    if (!this.#input) return
    if (!this.enabled) return this.#close()
    const seq = ++this.#refreshSeq
    const match = this.#detect()
    if (match === undefined) {
      this.#match = undefined
      this.#close()
      return
    }
    // A new (or moved) trigger: clear cancellation sticky state so the
    // menu can reopen on keystrokes that follow an `esc`. We compare on
    // source + start; cursor-only changes in the same word keep the
    // suppression if the user hit esc.
    if (
      this.#match === undefined ||
      this.#match.source !== match.source ||
      this.#match.start !== match.start
    ) {
      this.#cancelled = false
    }
    this.#match = match
    if (this.#cancelled) {
      this.#close()
      return
    }
    const source = this.#sources[match.source]
    const matcher: Matcher = (s) => fuzzyScore(match.query, s)
    const result = source.complete(match.query, matcher)
    const items = Array.isArray(result) ? result : await result
    // A newer refresh has already started — drop our stale result.
    if (seq !== this.#refreshSeq) return
    if (items.length === 0) {
      this.#close()
      return
    }
    // Forward the source's custom `render` so per-source row styling
    // kicks in. Explicitly clear it when the new source doesn't supply
    // one so we don't carry a previous source's renderer.
    this.select.state.set({ active: 0, items, render: source.render })
    this.#setVisible(true)
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
    const match = this.#match
    if (match === undefined) return
    // Completion keeps the trigger (`/`, `@`, ...) and only replaces the query.
    this.#replace(item, defaultAccept(item), match.end)
  }

  #accept(item: Option): void {
    const match = this.#match
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
    const match = this.#match
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
    this.#close()
  }

  #close(): void {
    if (!this.open) return
    this.#setVisible(false)
    // Clear the Menu's items + sticky grown-height so nothing stale
    // lingers in state (e.g. briefly visible if anything re-opens the
    // popup before a fresh complete() lands).
    this.select.state.set({ items: [] })
    this.select.resetHeight()
    void this.emit("close")
  }

  #setVisible(v: boolean): void {
    const was = this.open
    this.state.visible = v
    if (v && !was) void this.emit("open")
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
