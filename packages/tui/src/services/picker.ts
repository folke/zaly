import type { Node } from "../core/node.ts"
import type { Ref } from "../core/reactive.ts"
import type { OverlaySurface } from "../renderer/overlay.ts"
import type { Input } from "../widgets/input.ts"
import type { Menu } from "../widgets/menu.ts"
import type { PickerItem, PickerProps } from "../widgets/picker.ts"
import type { Widget } from "../widgets/widget.ts"

import { createRef, signal } from "../core/reactive.ts"
import { isMarkdown } from "../style/inspect.ts"
import { divider } from "../widgets/divider.ts"
import { markdown } from "../widgets/markdown.ts"
import { overlay } from "../widgets/overlay.ts"
import { picker } from "../widgets/picker.ts"
import { text } from "../widgets/text.ts"

export type PickOpts<T extends PickerItem<unknown> = PickerItem> = PickerProps<T> & {
  title?: string
  ref?: Ref<Menu<T>>
  details?: Widget | string
}
export class Picker {
  #ui: OverlaySurface
  #input: Input
  #open = signal(false)
  #close?: () => void

  constructor(ui: OverlaySurface, input: Input) {
    this.#ui = ui
    this.#input = input
  }

  get isOpen() {
    return this.#open.get
  }

  #pick<T extends PickerItem<unknown> = PickerItem>(opts: PickOpts<T>) {
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
      picker<T>({ ...opts, maxHeight: 8 }).ref(opts.ref)
    )
  }

  close() {
    if (this.#close) this.#close()
    this.#close = undefined
  }

  async pick<T extends PickerItem<unknown> = PickerItem>(
    opts: Omit<PickOpts<T>, "input">
  ): Promise<T | undefined> {
    this.close()
    const res = Promise.withResolvers<T | undefined>()
    let settled = false
    this.#input.consume()
    const ref = createRef<Menu<T>>()
    const node = this.#ui.open(() => this.#pick({ ...opts, input: this.#input, ref }))
    this.#open.set(true)
    const menu = ref()
    const ac = new AbortController()

    const done = (value?: T) => {
      if (settled) return
      settled = true
      ac.abort()
      this.#open.set(false)
      this.#input.consume()
      res.resolve(value)
      this.#ui.close(node)
    }

    node.once("unmount", () => done(), { signal: ac.signal })
    menu.once("cancel", () => done(), { signal: ac.signal })
    menu.once("select", ({ item }) => done(item), { signal: ac.signal })

    this.#close = done

    return res.promise
  }
}
