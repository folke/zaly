import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { RoutedKey } from "../input/router.ts"
import type { Style } from "../style/ansi.ts"
import type { Input } from "./input.ts"
import type { MenuItem } from "./menu.ts"

import { Node } from "../core/node.ts"
import { Menu } from "./menu.ts"

export type CompleteResult = MenuItem[] | Promise<MenuItem[]>

/** Single completion source. `triggers` are regexes run against the text
 *  *before the cursor*; the first regex whose match ends in the trailing
 *  word wins. The slice between match-end and the cursor becomes the
 *  `query` passed to `complete`. */
export interface CompletionSource {
  triggers: readonly RegExp[]
  complete: (query: string) => CompleteResult
}

// oxlint-disable-next-line no-empty-interface
export interface AutocompleteState extends Style {}

export interface AutocompleteOptions {
  input: Input
  sources: Record<string, CompletionSource>
  /** Cap on rows the popup shows at once. Default: 8. */
  maxHeight?: number
  /** Fired after an item is inserted into the input. Use it to trigger
   *  side-effects (e.g. dispatch `/model` to open a model picker). */
  onComplete?: (source: string, item: MenuItem) => void
  /** Whether to auto-append a trailing space after the inserted value
   *  (handy for slash commands; undesirable for paths). Default: `true`. */
  trailingSpace?: boolean
}

export interface AutocompleteEvents extends BaseEvents {
  open: []
  close: []
}

interface Match {
  source: string
  /** Absolute start index of the trigger in the input value. */
  start: number
  /** The query (text between trigger-end and cursor). */
  query: string
}

/**
 * Autocomplete popup bound to an `Input`. Watches the input's value and
 * cursor; when one of the configured sources' trigger regexes matches
 * the text before the cursor, the source's `complete(query)` is called
 * and the resulting items are shown in a `Menu` child.
 *
 * Selecting an item replaces the matched trigger-prefix + query with
 * the item's `value` and fires `onComplete(source, item)` for apps that
 * want to react beyond plain text insertion.
 *
 * ```ts
 * autocomplete({
 *   input: myInput,
 *   sources: {
 *     slash: {
 *       triggers: [/^\s*\//],
 *       complete: (q) => slashCommands.filter((c) => c.startsWith(q)),
 *     },
 *   },
 *   onComplete: (src, item) => { ... },
 * })
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

  readonly menu: Menu
  readonly #input: Input
  readonly #sources: Record<string, CompletionSource>
  readonly #onComplete: AutocompleteOptions["onComplete"]
  readonly #trailingSpace: boolean
  #match: Match | undefined
  #cancelled = false
  /** Increments each time a refresh starts, so an in-flight async
   *  `complete()` can notice it's been superseded and bail before
   *  writing stale items. */
  #refreshSeq = 0

  constructor(opts: AutocompleteOptions) {
    super({ visible: false })
    this.#input = opts.input
    this.#sources = opts.sources
    this.#onComplete = opts.onComplete
    this.#trailingSpace = opts.trailingSpace ?? true

    this.menu = new Menu({ items: [], maxHeight: opts.maxHeight ?? 8 })
    this.add(this.menu)

    // Re-evaluate whenever the bound input mutates. `invalidate` fires
    // on every state write, so this is the single hook we need. The
    // refresh kicks off synchronously; any async `complete(query)` adds
    // its own microtask, and the `#refreshSeq` guard prevents a slow
    // response from overwriting newer state.
    this.#input.on("invalidate", () => {
      void this.#refresh()
    })

    // Bridge menu events to input rewrite.
    this.menu.on("select", (item) => {
      this.#accept(item)
    })
    this.menu.on("cancel", () => {
      this.#cancelled = true
      this.#close()
    })
  }

  /**
   * Install keyboard interception. While the popup is open, `up` /
   * `down` / `tab` / `enter` / `esc` drive the menu instead of the
   * input's own actions; other keys flow through so typing keeps the
   * query in sync.
   *
   * Hooks directly into the bound `Input`'s `"key"` event (phase 1 of
   * dispatch) — stopping propagation there pre-empts keymap-driven
   * actions like `input.cursorUp`. This is the correct scope for a
   * popup that only exists while the input is focused: the input is
   * in the focus chain, the menu isn't, so a node-level listener
   * wins.
   *
   * Returns an unbind function.
   */
  bindKeys(): () => void {
    const listener = (ev: RoutedKey): void => {
      if (!this.open) return
      const id = ((): string | undefined => {
        switch (ev.pattern) {
          case "up": {
            return "menu.prev"
          }
          case "down": {
            return "menu.next"
          }
          case "tab":
          case "enter": {
            return "menu.select"
          }
          case "esc": {
            return "menu.cancel"
          }
          default: {
            return undefined
          }
        }
      })()
      if (id === undefined) return
      // Dispatch through the action registry with an explicit target
      // so it walks *from the menu* rather than the focused input —
      // the menu isn't in the focus chain, but its actions dict holds
      // the handlers we want.
      this.ctx?.actions.dispatch(id, { key: ev, source: "key", target: this.menu })
      ev.stop()
    }
    this.#input.on("key", listener)
    return () => {
      this.#input.off("key", listener)
    }
  }

  /** Whether the popup is currently showing. */
  get open(): boolean {
    return this.state.visible === true
  }

  async #refresh(): Promise<void> {
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
    const result = this.#sources[match.source].complete(match.query)
    const items = Array.isArray(result) ? result : await result
    // A newer refresh has already started — drop our stale result.
    if (seq !== this.#refreshSeq) return
    if (items.length === 0) {
      this.#close()
      return
    }
    this.menu.setState({ active: 0, items })
    this.#setVisible(true)
  }

  #detect(): Match | undefined {
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
        return { query, source: name, start: best.start }
      }
    }
    return undefined
  }

  #accept(item: MenuItem): void {
    const match = this.#match
    if (match === undefined) return
    const value = this.#input.state.value ?? ""
    const cursor = this.#input.state.cursor ?? 0
    const tail = value.slice(cursor)
    const insertion = this.#trailingSpace ? `${item.value} ` : item.value
    const next = value.slice(0, match.start) + insertion + tail
    const nextCursor = match.start + insertion.length
    this.#input.setState({ cursor: nextCursor, value: next })
    this.#onComplete?.(Object.keys(this.#sources).find((k) => k === match.source)!, item)
    this.#close()
  }

  #close(): void {
    if (!this.open) return
    this.#setVisible(false)
    this.emit("close")
  }

  #setVisible(v: boolean): void {
    const was = this.open
    this.state.visible = v
    if (v && !was) this.emit("open")
  }

  protected _render(ctx: RenderCtx): string[] | Promise<string[]> {
    // Menu does all the layout. We're just a wrapper node so callers
    // can place the popup in their tree and so the `visible` toggle
    // flows through one handle.
    return this.menu.render(ctx)
  }
}

/**
 * Factory for `Autocomplete`. See the class doc for the full API.
 */
export function autocomplete(opts: AutocompleteOptions): Autocomplete {
  return new Autocomplete(opts)
}
