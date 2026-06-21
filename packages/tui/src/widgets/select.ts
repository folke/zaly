import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { Reactive, Ref } from "../core/reactive.ts"
import type { State } from "../core/state.ts"
import type { NodeActionMap } from "../input/actions.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/types.ts"

import { fitAnsi, stringWidth } from "@zaly/shared/ansi"
import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { resolveSize } from "../layout/size.ts"

/** Default shape for selectable options. `text` is the canonical
 *  searchable/fallback label. `name` overrides the displayed label in the
 *  default renderer, and `desc` is shown as a dim right-column description. */
export type Option = {
  name?: string
  desc?: string
  text: string
}

export type OptionRenderCtx<T> = RenderCtx & {
  visible: T[]
  active?: boolean
}

/** Per-row rendering hook. `ctx.active` lets callers branch on selection
 *  state (e.g. swap an icon or pick a different fg) — but Select still
 *  applies the `optionActive` theme slot uniformly so the highlight stays
 *  visually consistent. The returned string is clipped/padded to the row
 *  width by Select. */
export type OptionRender<T> = (item: T, ctx: OptionRenderCtx<T>) => string

export interface SelectState<T extends Option = Option> extends Style {
  /** Items to show. Accepts a signal accessor so the list can be
   *  driven from reactive state (filtered results, search, etc.). */
  items: Reactive<readonly T[]>
  /** Index of the highlighted row. Defaults to 0; clamped on render. */
  active?: number
  /** Max item rows visible at once. The counter (when shown) is an
   *  extra row on top of this, not counted against the cap. Window
   *  slides to keep `active` in view (pin-until-leave). */
  maxHeight?: Reactive<number>
  /** Show a `(active+1 / total)` footer as an extra row when items
   *  don't fit. `undefined` (default) auto-shows when needed;
   *  `false` disables, `true` forces on. */
  counter?: boolean
  /** Render width. Defaults to `fill`. */
  width?: Size
  /** Width of the label column for the default renderer. Defaults to the
   *  widest visible label, capped to half the row width. Ignored when
   *  `render` is set. */
  labelWidth?: number
  /** Per-item renderer. When omitted, the default two-column layout uses
   *  `name ?? text` as the label and `desc` as the right-column hint. */
  render?: Reactive<OptionRender<T> | undefined>
  reverse?: boolean
}

export interface SelectEvents<T extends Option = Option> extends BaseEvents {
  /** Fired when the user completes the active item. Payload is the item. */
  complete: { item: T }
  /** Fired when the user picks the active item. Payload is the item. */
  accept: { item: T }
  /** Fired when the user cancels (esc). */
  cancel: {}
}

/**
 * Selectable list. Items are rendered one per row with an active-row
 * highlight; navigation actions (`next`, `prev`, `first`, `last`,
 * `accept`, `complete`, `cancel`) live on `this.actions`, same pattern as
 * `Input`.
 *
 * Used standalone for simple lists and as the underlying list primitive for
 * `picker`, `tree`, and `autocomplete`. Doesn't open/close itself — callers
 * control visibility via `state.visible`.
 */
export class Select<T extends Option = Option> extends Node<SelectState<T>, SelectEvents<T>> {
  static readonly type = "select"
  override readonly type = Select.type

  override actions = {
    "select.accept": (): void => {
      const items = this.#items
      if (items.length === 0) return
      void this.emit("accept", { item: items[this.active] })
    },
    "select.cancel": (): void => {
      void this.emit("cancel")
    },
    "select.complete": (): void => {
      const items = this.#items
      if (items.length === 0) return
      void this.emit("complete", { item: items[this.active] })
    },
    "select.first": (): void => {
      if (this.#items.length === 0) return
      this.active = 0
    },
    "select.last": (): void => {
      const n = this.#items.length
      if (n === 0) return
      this.active = n - 1
    },
    "select.next": (): void => {
      const n = this.#items.length
      if (n === 0) return
      this.active += this.#direction
    },
    "select.page-down": (): void => {
      const n = this.#items.length
      if (n === 0) return
      const page = Math.max(this.pageSize - 1, 1)
      this.state.active = this.#clamp(this.active + this.#direction * page)
    },
    "select.page-up": (): void => {
      const n = this.#items.length
      if (n === 0) return
      const page = Math.max(this.pageSize - 1, 1)
      this.state.active = this.#clamp(this.active - this.#direction * page)
    },
    "select.prev": (): void => {
      const n = this.#items.length
      if (n === 0) return
      this.active -= this.#direction
    },
  } satisfies NodeActionMap

  /** Top of the currently-rendered window, in absolute item indices.
   *  Updated per render using the pin-until-leave rule: stays put
   *  while `active` remains in `[start, start + visible)`, slides just
   *  enough to re-admit it otherwise. */
  #windowStart = 0

  constructor(initial: SelectState<T>) {
    super({ active: 0, ...initial } as SelectState<T>)
  }

  get #direction(): 1 | -1 {
    return this.state.reverse ? -1 : 1
  }

  get #items() {
    return unwrap(this.state.items)
  }

  #clamp(i: number): number {
    const n = this.#items.length
    return n === 0 ? 0 : Math.max(0, Math.min(n - 1, i))
  }

  set active(i: number) {
    const n = this.#items.length
    this.state.active = n === 0 ? 0 : ((i % n) + n) % n
  }

  get active(): number {
    const n = this.#items.length
    if (n === 0) return 0
    const a = this.state.active ?? 0
    return Math.max(0, Math.min(n - 1, a))
  }

  bind(node: Node | Ref<Node>): this {
    let n: Node | undefined
    const getn = () => (n = node instanceof Node ? node : node())
    this.on("mount", () => getn().addActionTarget(this))
    this.on("unmount", () => n?.removeActionTarget(this))
    if (this.mounted) getn().addActionTarget(this)
    return this
  }

  get count(): number {
    return this.#items.length
  }

  get pageSize(): number {
    return unwrap(this.state.maxHeight) ?? Math.max(this.#items.length, 1)
  }

  protected _render(ctx: RenderCtx): string[] {
    const items = this.#items
    if (items.length === 0) return []

    const width = resolveSize(this.state.width ?? "fill", ctx.width) ?? ctx.width
    const active = this.active
    const height = Math.min(this.pageSize, items.length)
    if (height === 0) return []

    // Pin-until-leave window. `#windowStart` is kept across renders so
    // the list doesn't recenter while the user nudges up/down inside
    let start = this.#windowStart
    if (active < start) start = active
    else if (active >= start + height) start = active - height + 1
    start = Math.max(0, Math.min(Math.max(0, items.length - height), start))
    this.#windowStart = start

    const visible = items.slice(start, start + height)
    const renderer = this.renderer

    const rows: string[] = []
    for (let i = start; i < start + height; i++) {
      const item = items[i]
      let row = renderer(item, { ...ctx, active: i === active, visible })
      row = fitAnsi(row, width)
      rows.push(i === active ? ctx.style.optionActive(row) : row)
    }
    if (this.state.reverse) rows.reverse()

    if (this.state.counter ?? items.length > height) {
      const shown = items.length === 0 ? 0 : active + 1
      const label = `(${shown}/${items.length})`
      rows.push(ctx.style.gutter(fitAnsi(label, width)))
    }

    return rows
  }

  get renderer(): OptionRender<T> {
    return unwrap(this.state.render) ?? this.defaultRenderer()
  }

  extendRenderer(fn: (prev: OptionRender<T>) => OptionRender<T>): this {
    const prev = this.renderer
    this.state.render = fn(prev)
    return this
  }

  defaultRenderer(): OptionRender<Option> {
    let visible: Option[] = []
    let labelWidth = 0

    const update = (ctx: OptionRenderCtx<Option>) => {
      if (ctx.visible === visible) return
      visible = ctx.visible
      if (!visible.some((i) => i.desc)) return (labelWidth = ctx.width) // No desc, so full width
      labelWidth = this.state.labelWidth ?? 0
      labelWidth ||= visible
        .map(itemLabel)
        .reduce((max, label) => Math.max(max, stringWidth(label)), 0)
      labelWidth = Math.min(labelWidth, Math.floor(ctx.width / 2))
    }

    return (item: Option, ctx): string => {
      update(ctx)
      const label = fitAnsi(itemLabel(item), labelWidth)
      if (!item.desc) return ctx.style.optionName(label)
      const desc = fitAnsi(item.desc ?? "", Math.max(0, ctx.width - labelWidth - 2))
      return `${ctx.style.optionName(label)}  ${ctx.style.optionDesc(desc)}`
    }
  }
}

const itemLabel = (item: Option): string => (item.name ?? item.text).replace(/\s+/g, " ").trim()

/**
 * Factory for a selectable list.
 *
 * ```ts
 * const s = select({ items: [{ text: "/help" }, { text: "/quit" }] })
 * s.on("accept", ({ item }) => console.log("picked", item.text))
 * ```
 */
export function select<T extends Option = Option>(state: State<SelectState<T>>): Select<T> {
  return new Select<T>(state)
}
