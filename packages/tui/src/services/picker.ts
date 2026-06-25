import type { Node } from "../core/node.ts"
import type { Ref } from "../core/reactive.ts"
import type { OverlaySurface } from "../renderer/overlay.ts"
import type { Input } from "../widgets/input.ts"
import type { Overlay } from "../widgets/overlay.ts"
import type { PickerSelectProps, PickerTreeProps } from "../widgets/picker.ts"
import type { Option, Select } from "../widgets/select.ts"
import type { Widget } from "../widgets/widget.ts"

import { createRef, signal } from "../core/reactive.ts"
import { isMarkdown } from "../style/inspect.ts"
import { divider } from "../widgets/divider.ts"
import { markdown } from "../widgets/markdown.ts"
import { overlay } from "../widgets/overlay.ts"
import { picker } from "../widgets/picker.ts"
import { text } from "../widgets/text.ts"

export type PickOpts<T extends Option = Option> = {
  title?: string
  ref?: Ref<Select<T>>
  details?: Widget | string
  clearInput?: boolean
} & (Omit<PickerSelectProps<T>, "input"> | Omit<PickerTreeProps<T>, "input">)

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
      picker<T>({ maxHeight: 8, ...opts }).ref(opts.ref)
    )
  }

  close() {
    if (this.#close) this.#close()
    this.#close = undefined
  }

  async pick<T extends Option = Option>(opts: PickOpts<T>): Promise<T | undefined> {
    this.close()
    const res = Promise.withResolvers<T | undefined>()
    let settled = false
    const prev = opts.clearInput ? this.#input.consume().value : undefined
    const ref = opts.ref ?? createRef<Select<T>>()
    const node = this.#ui.open(() => this.#pick({ ...opts, input: this.#input, ref }))
    this.#open.set(true)
    const select = ref()
    const ac = new AbortController()

    const done = (value?: T) => {
      if (settled) return
      settled = true
      ac.abort()
      this.#open.set(false)
      if (prev !== undefined) this.#input.replace(prev)
      res.resolve(value)
      this.#ui.close(node)
    }

    node.once("unmount", () => done(), { signal: ac.signal })
    select.once("cancel", () => done(), { signal: ac.signal })
    select.once("accept", ({ item }) => done(item), { signal: ac.signal })

    this.#close = done

    return res.promise
  }
}
