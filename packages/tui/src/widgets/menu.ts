import type { RenderCtx } from "../core/ctx.ts"
import type { BaseEvents } from "../core/node.ts"
import type { ActionMap } from "../input/actions.ts"
import type { Size } from "../layout/size.ts"
import type { Style } from "../style/ansi.ts"

import { sliceAnsi, stringWidth } from "#runtime"
import { Node } from "../core/node.ts"
import { resolveSize } from "../layout/size.ts"

/** A single selectable entry. `value` is what the autocomplete inserts;
 *  `label` is what renders (defaults to `value`); `hint` is a dim
 *  right-column description. */
export interface MenuItem {
  value: string
  label?: string
  hint?: string
}

export interface MenuState extends Style {
  items: MenuItem[]
  /** Index of the highlighted row. Defaults to 0; clamped on render. */
  active?: number
  /** Max rows visible at once — window slides to keep `active` in view. */
  maxHeight?: number
  /** Render width. Defaults to `fill`. */
  width?: Size
  /** Width of the label column. Defaults to the widest item label + 2. */
  labelWidth?: number
}

export interface MenuEvents extends BaseEvents {
  /** Fired when the user picks the active item. Payload is the item. */
  select: [MenuItem]
  /** Fired when the user cancels (esc). */
  cancel: []
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
export class Menu extends Node<MenuState, MenuEvents> {
  static readonly type = "menu"
  override readonly type = Menu.type

  override actions = {
    "menu.cancel": (): void => {
      this.emit("cancel")
    },
    "menu.first": (): void => {
      if (this.state.items.length === 0) return
      this.state.active = 0
    },
    "menu.last": (): void => {
      const n = this.state.items.length
      if (n === 0) return
      this.state.active = n - 1
    },
    "menu.next": (): void => {
      const n = this.state.items.length
      if (n === 0) return
      this.state.active = (this.#active() + 1) % n
    },
    "menu.prev": (): void => {
      const n = this.state.items.length
      if (n === 0) return
      this.state.active = (this.#active() - 1 + n) % n
    },
    "menu.select": (): void => {
      const items = this.state.items
      if (items.length === 0) return
      const i = this.#active()
      this.emit("select", items[i])
    },
  } satisfies ActionMap

  constructor(initial: MenuState) {
    super({ active: 0, ...initial })
  }

  #active(): number {
    const n = this.state.items.length
    if (n === 0) return 0
    const a = this.state.active ?? 0
    return Math.max(0, Math.min(n - 1, a))
  }

  protected _render(ctx: RenderCtx): string[] {
    const items = this.state.items
    if (items.length === 0) return []

    const width = resolveSize(this.state.width ?? "fill", ctx.width) ?? ctx.width
    const active = this.#active()
    const max = this.state.maxHeight ?? items.length
    const visible = Math.min(max, items.length)

    // Slide a window of `visible` items so the active index is always in
    // view. Keeps the list anchored to the top when we can fit everything.
    let start = 0
    if (items.length > visible) {
      // Simple centered-ish window: try to place active in the middle.
      const half = Math.floor(visible / 2)
      start = Math.max(0, Math.min(items.length - visible, active - half))
    }

    // Auto-size the label column to the widest label in the visible
    // window, with a small gap before hints. Cap at ~half the width so a
    // very long label doesn't crowd out the hint.
    const gap = 2
    const widest = Math.max(
      ...items.slice(start, start + visible).map((it) => stringWidth(it.label ?? it.value))
    )
    const labelWidth = Math.min(this.state.labelWidth ?? widest, Math.floor(width / 2))

    const rows: string[] = []
    for (let i = start; i < start + visible; i++) {
      const item = items[i]
      const label = item.label ?? item.value
      const hint = item.hint ?? ""
      const isActive = i === active

      // Compose the raw cells: label in its own column, hint in the rest.
      // Clip/pad each independently so long labels don't push hints out.
      const labelCell = fit(label, labelWidth)
      const hintAvail = Math.max(0, width - labelWidth - gap)
      const hintCell = fit(hint, hintAvail)

      // Theme slots: `menuLabel` styles the command text, `menuHint` the
      // dim right-column description, `menuActive` paints the whole row
      // for the focused item. Apps override these three to restyle the
      // menu without touching widget code.
      const labelStyled = ctx.style.add("menuLabel")(labelCell)
      const hintStyled = ctx.style.add("menuHint")(hintCell)
      const spacer = " ".repeat(gap)
      const composed = labelStyled + spacer + hintStyled
      rows.push(isActive ? ctx.style.add("menuActive")(composed) : composed)
    }
    return rows
  }
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
export function menu(state: MenuState): Menu {
  return new Menu(state)
}
