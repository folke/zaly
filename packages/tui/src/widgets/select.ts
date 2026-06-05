import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { Reactive, Ref } from "../core/reactive.ts"
import type { NodeActionMap } from "../input/actions.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/types.ts"

import { stringWidth, truncateAnsi } from "@zaly/shared/ansi"
import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { resolveSize } from "../layout/size.ts"

/** Default shape for items in a Menu. All fields optional so callers
 *  can produce either a fully-fledged entry or a custom-typed item
 *  plus their own `render`. `value` is what `Autocomplete`'s default
 *  `accept` inserts; `label` is what the default renderer shows
 *  (falling back to `value`); `hint` is a dim right-column description. */
export type Option<T = unknown> = {
  name?: string
  desc?: string
  value: T
  /** When true, the item is a match for the current query */
  match?: boolean
  /** For pickers: override the text used for matching/searching */
  search?: string
}

export type OptionRenderCtx<T> = RenderCtx & {
  visible: T[]
}

/** Per-row rendering hook. `active` lets callers branch on selection
 *  state (e.g. swap an icon or pick a different fg) — but Menu still
 *  applies the `menuActive` theme slot uniformly so the highlight
 *  stays visually consistent across the widget ecosystem. The returned
 *  string is clipped/padded to the row width by Menu. `ctx` is the
 *  current `RenderCtx` so renderers can call `ctx.style.*` for theme-
 *  aware ANSI without capturing it from elsewhere. */
export type OptionRender<T> = (item: T, active: boolean, ctx: OptionRenderCtx<T>) => string

export interface SelectState<T extends Option = Option> extends Style {
  /** Items to show. Accepts a signal accessor so the list can be
   *  driven from reactive state (filtered results, search, etc.). */
  items: Reactive<readonly T[]>
  /** Index of the highlighted row. Defaults to 0; clamped on render. */
  active?: number
  /** Max item rows visible at once. The counter (when shown) is an
   *  extra row on top of this, not counted against the cap. Window
   *  slides to keep `active` in view (pin-until-leave). */
  maxHeight?: number
  /** Show a `(active+1 / total)` footer as an extra row when items
   *  don't fit. `undefined` (default) auto-shows when needed;
   *  `false` disables, `true` forces on. */
  counter?: boolean
  /** When `true`, the rendered height can grow but never shrinks
   *  between renders. Useful for popups (autocomplete) where the
   *  surrounding layout would jitter if the menu resized while the
   *  user types. Call `resetHeight()` to start a fresh open cycle.
   *  Default: `false`. */
  sticky?: boolean
  /** Render width. Defaults to `fill`. */
  width?: Size
  /** Width of the label column for the default renderer. Defaults to
   *  the widest item label + 2. Ignored when `render` is set. */
  labelWidth?: number
  /** Per-item renderer. When omitted, items must be `MenuItem`-shaped
   *  (carry at least `label` or `value`) and the default two-column
   *  layout applies. */
  render?: OptionRender<T>
}

export interface SelectEvents<T extends Option = Option> extends BaseEvents {
  /** Fired when the user completes the active item. Payload is the item. */
  complete: { item: T }
  /** Fired when the user picks the active item. Payload is the item. */
  accept: { item: T }
  /** Fired when the user cancels (esc). */
  cancel: {}
}

export type Selectable<T extends Option = Option> = Node<object, SelectEvents<T>>

/**
 * Selectable list. Items are rendered one per row with an active-row
 * highlight; navigation actions (`next`, `prev`, `first`, `last`,
 * `select`, `cancel`) live on `this.actions`, same pattern as `Input`.
 *
 * Used standalone for simple pickers (confirm dialogs, model selectors)
 * and as the underlying list for `Autocomplete`. Doesn't open/close
 * itself — callers control visibility via `state.visible`.
 */
export class Select<T extends Option = Option>
  extends Node<SelectState<T>, SelectEvents<T>>
  implements Selectable<T>
{
  static readonly type = "select"
  override readonly type = Select.type

  override actions = {
    "select.accept": (): void => {
      const items = this.#items()
      if (items.length === 0) return
      const i = this.#active()
      void this.emit("accept", { item: items[i] })
    },
    "select.cancel": (): void => {
      void this.emit("cancel")
    },
    "select.complete": (): void => {
      const items = this.#items()
      if (items.length === 0) return
      const i = this.#active()
      void this.emit("complete", { item: items[i] })
    },
    "select.first": (): void => {
      if (this.#items().length === 0) return
      this.state.active = 0
    },
    "select.last": (): void => {
      const n = this.#items().length
      if (n === 0) return
      this.state.active = n - 1
    },
    "select.next": (): void => {
      const n = this.#items().length
      if (n === 0) return
      this.active = this.#active() + 1
    },
    "select.next-match": (): void => {
      const active = this.#active()
      const matches = this.#matches.map((i) => i.idx)
      if (matches.length === 0) return this.actions["select.next"]()
      this.active = matches.find((i) => i > active) ?? matches[0]
    },
    "select.page-down": (): void => {
      const n = this.#items().length
      if (n === 0) return
      const page = Math.max(this.pageSize - 1, 1)
      this.active = this.#active() + page
    },
    "select.page-up": (): void => {
      const n = this.#items().length
      if (n === 0) return
      const page = Math.max(this.pageSize - 1, 1)
      this.active = this.#active() - page
    },
    "select.prev": (): void => {
      const n = this.#items().length
      if (n === 0) return
      this.active = this.#active() - 1
    },
    "select.prev-match": (): void => {
      const active = this.#active()
      const matches = this.#matches.map((i) => i.idx).toReversed()
      if (matches.length === 0) return this.actions["select.prev"]()
      this.active = matches.find((i) => i < active) ?? matches[0]
    },
  } satisfies NodeActionMap

  /** Grow-only height counter. `state.sticky` consults this so filter-
   *  driven shrinks don't jitter the surrounding layout. */
  #stickyRows = 0
  /** Whether the counter row has ever shown during this sticky session.
   *  Once true, we keep rendering it even when items fit — otherwise
   *  filtering down to within `maxHeight` would drop the counter row
   *  and shrink the overall menu height by one. */
  #stickyCounter = false
  /** Top of the currently-rendered window, in absolute item indices.
   *  Updated per render using the pin-until-leave rule: stays put
   *  while `active` remains in `[start, start + visible)`, slides just
   *  enough to re-admit it otherwise. */
  #windowStart = 0

  constructor(initial: SelectState<T>) {
    super({ active: 0, ...initial } as SelectState<T>)
  }

  /** Reset the sticky height + window anchor. Callers owning the
   *  open/close lifecycle (e.g. `Autocomplete`) invoke this on close
   *  so the next open starts from scratch. */
  resetHeight(): void {
    this.#stickyRows = 0
    this.#stickyCounter = false
    this.#windowStart = 0
    this.invalidate()
  }

  set active(i: number) {
    const n = this.#items().length
    i = i < 0 ? i + n : i
    this.state.active = n === 0 ? 0 : i % n
  }

  get #matches(): readonly { idx: number; item: T }[] {
    return this.#items()
      .map((item, idx) => ({ idx, item }))
      .filter((i) => i.item.match)
  }

  #items(): readonly T[] {
    return unwrap(this.state.items)
  }

  #active(): number {
    const n = this.#items().length
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

  get pageSize(): number {
    return this.state.maxHeight ?? Math.max(this.#items().length, 1)
  }

  protected _render(ctx: RenderCtx): string[] {
    const items = this.#items()
    if (items.length === 0 && !this.state.sticky) return []

    const width = resolveSize(this.state.width ?? "fill", ctx.width) ?? ctx.width
    const active = this.#active()
    const max = this.pageSize

    // Item-row budget: cap by maxHeight, but when `sticky` is on it can
    // only grow. Zero is allowed (no items, not sticky-grown) — we
    // bailed above in that case.
    let rows = Math.min(max, items.length)
    if (this.state.sticky) {
      rows = Math.max(this.#stickyRows, rows)
      this.#stickyRows = rows
    }
    if (rows === 0) return []

    // Pin-until-leave window. `#windowStart` is kept across renders so
    // the list doesn't recenter while the user nudges up/down inside
    // the current viewport. Slide only when `active` would fall off
    // either edge, and clamp against the tail so we don't expose rows
    // past items.length when the list shrinks.
    let start = this.#windowStart
    if (active < start) start = active
    else if (active >= start + rows) start = active - rows + 1
    start = Math.max(0, Math.min(Math.max(0, items.length - rows), start))
    this.#windowStart = start

    const overflow = items.length > rows
    let showCounter = this.state.counter ?? overflow
    if (this.state.sticky) {
      // Counter is sticky too: once shown in this session, keep it so
      // filtering-down doesn't shave the last row off the menu height.
      if (showCounter) this.#stickyCounter = true
      if (this.#stickyCounter && this.state.counter !== false) showCounter = true
    }

    // Compose the per-row renderer. Custom `render` takes precedence;
    // otherwise fall back to the built-in two-column layout (requires
    // items shaped like `MenuItem`).
    const visible = items.slice(start, start + rows)
    const blank = " ".repeat(width)
    const optionCtx: OptionRenderCtx<T> = { ...ctx, visible }

    const renderer = this.optionRenderer

    const out: string[] = []
    for (let i = start; i < start + rows; i++) {
      const item = items[i] as T | undefined
      if (item === undefined) {
        // Sticky kept the row alive past the end of the (now shorter)
        // items list. Emit a full-width blank.
        out.push(blank)
        continue
      }
      const isActive = i === active
      const raw = renderer(item, isActive, optionCtx)
      // Menu always pads/clips to row width and applies `menuActive`
      // on the selected row — keeps selection visuals consistent across
      // apps regardless of what the custom render produced.
      const cell = fit(raw, width)
      out.push(isActive ? ctx.style.add("menuActive")(cell) : cell)
    }

    if (showCounter) {
      const shown = items.length === 0 ? 0 : active + 1
      const label = `(${shown}/${items.length})`
      out.push(ctx.style.gutter(fit(label, width)))
    }

    return out
  }

  get optionRenderer(): OptionRender<T> {
    return this.state.render ?? this.defaultRenderer()
  }

  defaultRenderer(): OptionRender<Option> {
    let visible: Option[] = []
    let widest = 0

    const update = (ctx: OptionRenderCtx<Option>): void => {
      if (ctx.visible === visible) return
      visible = ctx.visible
      const labels = ctx.visible.map(defaultLabel)
      // Pre-compute label column width once from the visible window —
      // custom renderers skip this entirely.
      widest = labels.length === 0 ? 0 : Math.max(...labels.map(stringWidth))
    }
    const gap = 2
    const spacer = " ".repeat(gap)
    return (item: Option, _active, ctx): string => {
      update(ctx)
      const labelWidth = Math.min(this.state.labelWidth ?? widest, Math.floor(ctx.width / 2))
      const descAvail = Math.max(0, ctx.width - labelWidth - gap)
      const nameCell = fit(defaultLabel(item), labelWidth)
      const descCell = fit(item.desc ?? "", descAvail)
      return ctx.style.add("menuLabel")(nameCell) + spacer + ctx.style.add("menuHint")(descCell)
    }
  }
}

function defaultLabel(item: Option): string {
  const label = item.name ?? (typeof item.value === "string" ? item.value : String(item.value))
  return label.replace(/\s+/g, " ").trim() // collapse whitespace for cleaner default layout
}

function fit(s: string, width: number): string {
  const w = stringWidth(s)
  if (w === width) return s
  if (w < width) return s + " ".repeat(width - w)
  return truncateAnsi(s, width)
}

/**
 * Factory for `Menu`.
 *
 * ```ts
 * const m = menu({ items: [{ value: "/help" }, { value: "/quit" }] })
 * m.on("select", (item) => console.log("picked", item.value))
 * ```
 */
export function select<T extends Option = Option>(state: SelectState<T>): Select<T> {
  return new Select<T>(state)
}
