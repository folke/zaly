import type { Node } from "../core/node.ts"
import type { Ref } from "../core/reactive.ts"
import type { OverlaySurface } from "../renderer/overlay.ts"
import type { Input } from "../widgets/input.ts"
import type { Overlay } from "../widgets/overlay.ts"
import type { PickerSelectProps, PickerTreeProps } from "../widgets/picker.ts"
import type { Option, Selectable } from "../widgets/select.ts"
import type { TreeNode } from "../widgets/tree.ts"
import type { Widget } from "../widgets/widget.ts"

import { createRef, signal } from "../core/reactive.ts"
import { isMarkdown } from "../style/inspect.ts"
import { divider } from "../widgets/divider.ts"
import { markdown } from "../widgets/markdown.ts"
import { overlay } from "../widgets/overlay.ts"
import { picker } from "../widgets/picker.ts"
import { text } from "../widgets/text.ts"

export type PickSelectOpts<T extends Option = Option> = Omit<PickerSelectProps<T>, "input"> & {
  title?: string
  ref?: Ref<Selectable<T>>
  details?: Widget | string
}

export type PickTreeOpts<T extends TreeNode = TreeNode> = Omit<PickerTreeProps<T>, "input"> & {
  title?: string
  details?: Widget | string
}

export type PickOpts<T extends Option = Option> = PickSelectOpts<T> | PickTreeOpts<T>

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
    opts: (PickSelectOpts<T> | PickTreeOpts<T>) & { input: Input; ref: Ref<Selectable<T>> }
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
    const prev = this.#input.consume().value
    const ref = createRef<Selectable<T>>()
    const node = this.#ui.open(() => this.#pick({ ...opts, input: this.#input, ref }))
    this.#open.set(true)
    const menu = ref()
    const ac = new AbortController()

    const done = (value?: T) => {
      if (settled) return
      settled = true
      ac.abort()
      this.#open.set(false)
      this.#input.replace(prev)
      res.resolve(value)
      this.#ui.close(node)
    }

    node.once("unmount", () => done(), { signal: ac.signal })
    menu.once("cancel", () => done(), { signal: ac.signal })
    menu.once("accept", ({ item }) => done(item), { signal: ac.signal })

    this.#close = done

    return res.promise
  }
}
