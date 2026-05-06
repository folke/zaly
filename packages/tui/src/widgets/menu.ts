import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { Reactive } from "../core/reactive.ts"
import type { ActionMap } from "../input/actions.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/types.ts"

import { Node } from "../core/node.ts"
import { unwrap } from "../core/reactive.ts"
import { resolveSize } from "../layout/size.ts"
import { sliceAnsi, stringWidth } from "../style/ansi.ts"

/** Default shape for items in a Menu. All fields optional so callers
 *  can produce either a fully-fledged entry or a custom-typed item
 *  plus their own `render`. `value` is what `Autocomplete`'s default
 *  `accept` inserts; `label` is what the default renderer shows
 *  (falling back to `value`); `hint` is a dim right-column description. */
export interface MenuItem {
  value?: string
  label?: string
  hint?: string
}

/** Per-row rendering hook. `active` lets callers branch on selection
 *  state (e.g. swap an icon or pick a different fg) — but Menu still
 *  applies the `menuActive` theme slot uniformly so the highlight
 *  stays visually consistent across the widget ecosystem. The returned
 *  string is clipped/padded to the row width by Menu. `ctx` is the
 *  current `RenderCtx` so renderers can call `ctx.style.*` for theme-
 *  aware ANSI without capturing it from elsewhere. */
export type MenuRender<T> = (item: T, active: boolean, ctx: RenderCtx) => string

export interface MenuState<T = MenuItem> extends Style {
  /** Items to show. Accepts a signal accessor so the list can be
   *  driven from reactive state (filtered results, search, etc.). */
  items: Reactive<T[]>
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
  render?: MenuRender<T>
}

export interface MenuEvents<T = MenuItem> extends BaseEvents {
  /** Fired when the user picks the active item. Payload is the item. */
  select: { item: T }
  /** Fired when the user cancels (esc). */
  cancel: {}
}

/**
 * Selectable list. Items are rendered one per row with an active-row
 * highlight; navigation actions (`next`, `prev`, `first`, `last`,
 * `select`, `cancel`) live on `this.actions`, same pattern as `Input`.
 *
 * Used standalone for simple pickers (confirm dialogs, model selectors)
 * and as the underlying list for `Autocomplete`. Doesn't open/close
 * itself — callers control visibility via `state.visible`.
 */
export class Menu<T extends MenuItem = MenuItem> extends Node<MenuState<T>, MenuEvents<T>> {
  static readonly type = "menu"
  override readonly type = Menu.type

  override actions = {
    "menu.cancel": (): void => {
      this.emit("cancel")
    },
    "menu.first": (): void => {
      if (this.#items().length === 0) return
      this.state.active = 0
    },
    "menu.last": (): void => {
      const n = this.#items().length
      if (n === 0) return
      this.state.active = n - 1
    },
    "menu.next": (): void => {
      const n = this.#items().length
      if (n === 0) return
      this.state.active = (this.#active() + 1) % n
    },
    "menu.prev": (): void => {
      const n = this.#items().length
      if (n === 0) return
      this.state.active = (this.#active() - 1 + n) % n
    },
    "menu.select": (): void => {
      const items = this.#items()
      if (items.length === 0) return
      const i = this.#active()
      this.emit("select", { item: items[i] })
    },
  } satisfies ActionMap

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

  constructor(initial: MenuState<T>) {
    super({ active: 0, ...initial } as MenuState<T>)
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

  #items(): T[] {
    return unwrap(this.state.items)
  }

  #active(): number {
    const n = this.#items().length
    if (n === 0) return 0
    const a = this.state.active ?? 0
    return Math.max(0, Math.min(n - 1, a))
  }

  protected _render(ctx: RenderCtx): string[] {
    const items = this.#items()
    if (items.length === 0 && !this.state.sticky) return []

    const width = resolveSize(this.state.width ?? "fill", ctx.width) ?? ctx.width
    const active = this.#active()
    const max = this.state.maxHeight ?? Math.max(items.length, 1)

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
    const custom = this.state.render
    const windowItems = items.slice(start, start + rows)
    const blank = " ".repeat(width)

    const defaultRender = ((): ((item: T) => string) => {
      // Pre-compute label column width once from the visible window —
      // custom renderers skip this entirely.
      const widest =
        windowItems.length === 0
          ? 0
          : Math.max(...windowItems.map((it) => stringWidth(defaultLabel(it))))
      const gap = 2
      const labelWidth = Math.min(this.state.labelWidth ?? widest, Math.floor(width / 2))
      const hintAvail = Math.max(0, width - labelWidth - gap)
      const spacer = " ".repeat(gap)
      return (item: T): string => {
        const mi = item as unknown as MenuItem
        if (mi.label === undefined && mi.value === undefined) {
          throw new Error("Menu: items without `label` or `value` require a custom `render`")
        }
        const labelCell = fit(defaultLabel(item), labelWidth)
        const hintCell = fit(mi.hint ?? "", hintAvail)
        return ctx.style.add("menuLabel")(labelCell) + spacer + ctx.style.add("menuHint")(hintCell)
      }
    })()

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
      const raw = custom ? custom(item, isActive, ctx) : defaultRender(item)
      // Menu always pads/clips to row width and applies `menuActive`
      // on the selected row — keeps selection visuals consistent across
      // apps regardless of what the custom render produced.
      const cell = fit(raw, width)
      out.push(isActive ? ctx.style.add("menuActive")(cell) : cell)
    }

    if (showCounter) {
      const shown = items.length === 0 ? 0 : active + 1
      const label = `(${shown}/${items.length})`
      out.push(ctx.style.add("menuHint")(fit(label, width)))
    }

    return out
  }
}

function defaultLabel(item: unknown): string {
  if (typeof item === "object" && item !== null) {
    const mi = item as MenuItem
    return mi.label ?? mi.value ?? ""
  }
  return String(item)
}

function fit(s: string, width: number): string {
  const w = stringWidth(s)
  if (w === width) return s
  if (w < width) return s + " ".repeat(width - w)
  return sliceAnsi(s, 0, width)
}

/**
 * Factory for `Menu`.
 *
 * ```ts
 * const m = menu({ items: [{ value: "/help" }, { value: "/quit" }] })
 * m.on("select", (item) => console.log("picked", item.value))
 * ```
 */
export function menu<T extends MenuItem = MenuItem>(state: MenuState<T>): Menu<T> {
  return new Menu<T>(state)
}
