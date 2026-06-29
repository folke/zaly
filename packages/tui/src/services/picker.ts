import type { Node } from "../core/node.ts"
import type { Ref } from "../core/reactive.ts"
import type { ActionFilter } from "../input/actions.ts"
import type { OverlaySurface } from "../renderer/overlay.ts"
import type { Input } from "../widgets/input.ts"
import type { Overlay } from "../widgets/overlay.ts"
import type { PickerItem, PickerSelectProps, PickerTreeProps } from "../widgets/picker.ts"
import type { Option, Select } from "../widgets/select.ts"
import type { Widget } from "../widgets/widget.ts"

import { createRef, signal } from "../core/reactive.ts"
import { isMarkdown } from "../style/inspect.ts"
import { divider } from "../widgets/divider.ts"
import { markdown } from "../widgets/markdown.ts"
import { overlay } from "../widgets/overlay.ts"
import { picker } from "../widgets/picker.ts"
import { text } from "../widgets/text.ts"

export type ToggleItem = PickerItem & { enabled?: boolean }

export type PickOpts<T extends Option = Option> = {
  title?: string
  multi?: boolean | { action?: boolean; render?: boolean }
  ref?: Ref<Select<T>>
  details?: Widget | string
  clearInput?: boolean
  restoreInput?: boolean
  whichKey?: boolean | ActionFilter
} & (Omit<PickerSelectProps<T>, "input"> | Omit<PickerTreeProps<T>, "input">)

export class Picker {
  #ui: OverlaySurface
  #input: Input
  #open = signal(false)
  #active: Overlay[] = []

  constructor(ui: OverlaySurface, input: Input) {
    this.#ui = ui
    this.#input = input
  }

  get isOpen() {
    return this.#open.get
  }

  #pick<T extends Option = Option>(
    opts: PickOpts<T> & { input: Input; ref: Ref<Select<T>> }
  ): Overlay {
    const children: Node[] = []
    if (opts.title)
      children.push(
        isMarkdown(opts.title) ? markdown(opts.title) : text(opts.title, { style: "borderTitle" })
      )
    if (opts.details) {
      if (typeof opts.details === "string")
        children.push(isMarkdown(opts.details) ? markdown(opts.details) : text(opts.details))
      else children.push(opts.details())
    }

    const select = picker<T>({ maxHeight: 8, ...opts })
    select.ref(opts.ref)
    if (opts.multi)
      this.#multi(select as unknown as Select<ToggleItem>, opts.multi === true ? {} : opts.multi)

    if (opts.whichKey) {
      const [whichKey, setWhichKey] = signal("")
      const filter = opts.whichKey === true ? { hidden: false } : opts.whichKey
      select.once("mount", () => setWhichKey(this.#ui.$r.actions.whichKey(select, { filter })))
      children.push(markdown(whichKey))
    }

    if (children.length > 0) children.push(divider({ style: "border" }))
    return overlay(
      {
        padding: [0, 1],
        relative: "ui",
        style: "ui",
        verticalAnchor: "bottom",
        x: 0,
        y: 1,
      },
      divider({ style: "accent" }),
      ...children,
      select
    )
  }

  #multi(select: Select<ToggleItem>, opts: { action?: boolean; render?: boolean } = {}) {
    if (opts.render !== false)
      select.extendRenderer((prev) => (item, ctx) => {
        const s = ctx.style
        const row = prev(item, { ...ctx, width: ctx.width - 4 })
        const enabled = item.enabled
        if (enabled === undefined) return row
        return `${enabled ? s.mdListChecked("[x]") : s.mdListUnchecked("[ ]")} ${row}`
      })
    if (opts.action !== false)
      select.withActions({
        "picker.toggle": {
          desc: "Toggle item",
          fn: () => {
            const active = select.item
            if (!active) return
            active.enabled = !active.enabled
            select.invalidate()
          },
          keys: ["tab", "enter"],
          priority: 10,
        },
      })
  }

  close(opts: { all?: boolean } = {}) {
    while (this.#active.length > 0) {
      const node = this.#active.pop()!
      this.#ui.close(node)
      if (!opts.all) break
    }
  }

  get active() {
    return this.#active.at(-1)
  }

  suspend() {
    this.active?.hide()
  }

  resume() {
    this.active?.show()
  }

  async pick<T extends Option = Option>(opts: PickOpts<T>): Promise<T | undefined> {
    this.active?.hide()
    const res = Promise.withResolvers<T | undefined>()
    let settled = false
    const clear = opts.clearInput ?? true
    const restore = opts.restoreInput ?? true
    const prevInput = clear ? this.#input.consume().value : undefined
    const ref = opts.ref ?? createRef<Select<T>>()
    const node = this.#ui.open(() => this.#pick({ ...opts, input: this.#input, ref }))
    this.#active.push(node)
    this.#open.set(true)
    const select = ref()

    const ac = new AbortController()
    const done = (value?: T) => {
      if (settled) return
      settled = true
      ac.abort()
      this.#active = this.#active.filter((n) => n !== node)
      if (restore && prevInput !== undefined) this.#input.replace(prevInput)
      else if (!restore) this.#input.consume()
      res.resolve(value)
      this.#ui.close(node)
      this.active?.show()
      this.#open.set(this.#active.length > 0)
    }

    node.once("unmount", () => done(), { signal: ac.signal })
    select.once("close", () => done(), { signal: ac.signal })
    select.once("accept", ({ item }) => done(item), { signal: ac.signal })
    select.once("complete", ({ item }) => done(item), { signal: ac.signal })

    return res.promise
  }
}
