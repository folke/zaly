import type { Node } from "../core/node.ts"
import type { OverlaySurface } from "../renderer/overlay.ts"
import type { Input } from "../widgets/input.ts"
import type { Overlay } from "../widgets/overlay.ts"
import type { PickerItem } from "../widgets/picker.ts"
import type { Widget } from "../widgets/widget.ts"

import { signal } from "../core/reactive.ts"
import { isMarkdown } from "../style/inspect.ts"
import { divider } from "../widgets/divider.ts"
import { markdown } from "../widgets/markdown.ts"
import { overlay } from "../widgets/overlay.ts"
import { text } from "../widgets/text.ts"

export type ToggleItem = PickerItem & { enabled?: boolean }

export type PromptOpts = {
  title?: string
  details?: Widget | string
  clearInput?: boolean
  restoreInput?: boolean
}

export type PromptEvents = {
  close: {}
  submit: { value: string }
}

export class Prompt {
  #ui: OverlaySurface
  #input: Input
  #open = signal(false)
  #node?: Overlay

  constructor(ui: OverlaySurface, input: Input) {
    this.#ui = ui
    this.#input = input
  }

  get isOpen() {
    return this.#open.get
  }

  #overlay(opts: PromptOpts) {
    const children: Node[] = []
    if (opts.title)
      children.push(
        isMarkdown(opts.title)
          ? markdown(opts.title, { style: "borderTitle" })
          : text(opts.title, { style: "borderTitle" })
      )
    if (opts.details) {
      if (typeof opts.details === "string")
        children.push(isMarkdown(opts.details) ? markdown(opts.details) : text(opts.details))
      else children.push(opts.details())
    }

    const ret = overlay(
      {
        padding: [0, 1],
        relative: "ui",
        style: "ui",
        verticalAnchor: "bottom",
        x: 0,
        y: 1,
      },
      divider({ style: "accent" }),
      ...children
    ).withEvents<PromptEvents>()
    return ret.withActions({
      "prompt.close": {
        fn: () => void ret.emit("close"),
        keys: ["esc"],
      },
      "prompt.submit": {
        fn: () => void ret.emit("submit", { value: this.#input.state.value ?? "" }),
        keys: ["enter"],
      },
    })
  }

  close() {
    const node = this.#node
    if (!node) return
    this.#ui.close(node)
    this.#node = undefined
  }

  async open(msg: string | PromptOpts): Promise<string | undefined> {
    this.close()
    const opts = typeof msg === "string" ? { title: msg } : msg
    const res = Promise.withResolvers<string | undefined>()
    let settled = false
    const clear = opts.clearInput ?? true
    const restore = opts.restoreInput ?? true
    const prevInput = clear ? this.#input.consume().value : undefined
    const node = this.#ui.open(() => this.#overlay(opts))
    this.#node = node
    this.#open.set(true)
    this.#input.addActionTarget(node)

    const ac = new AbortController()
    const done = (value?: string) => {
      if (settled) return
      settled = true
      ac.abort()
      this.#input.removeActionTarget(node)
      if (restore && prevInput !== undefined) this.#input.replace(prevInput)
      else if (!restore) this.#input.consume()
      res.resolve(value)
      this.close()
      this.#open.set(false)
    }

    node.once("unmount", () => done(), { signal: ac.signal })
    node.once("close", () => done(), { signal: ac.signal })
    node.once("submit", ({ value }) => done(value), { signal: ac.signal })

    return res.promise
  }
}
