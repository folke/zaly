import type { MetaOf, ParamsOf, Tool, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Accessor, Reactive, Signal } from "@zaly/tui"
import type { BubbleType } from "./bubble.ts"

import { parseJson, safeParseToolParams } from "@zaly/ai"
import { throttle } from "@zaly/shared/throttle"
import { effect, memo, onCleanup, signal, untrack, unwrap } from "@zaly/tui"
import { box } from "@zaly/tui/widgets/box"
import { log } from "@zaly/tui/widgets/log"
import { show } from "@zaly/tui/widgets/show"
import { text } from "@zaly/tui/widgets/text"
import { widget } from "@zaly/tui/widgets/widget"
import { bubble } from "./bubble.ts"
import { toolRenderer } from "./tools/registry.ts"

export type ToolViewOpts<T extends Tool = Tool> = {
  call: ToolCallPart<T["name"], ParamsOf<T> | string>
  cwd: string
  result?: ToolResult<MetaOf<T>>
  /** Keeps the widget live/sticky; replay can hold already-completed calls. */
  pending?: Accessor<boolean>
  collapsed?: Reactive<boolean>
}

export type ToolViewParams<T extends Tool = Tool> = { description?: string } & Partial<ParamsOf<T>>

/** Reactive state shared by a tool preview, its result renderer, and the stream controller. */
export class ToolView<T extends Tool = Tool> {
  readonly name: T["name"]
  readonly cwd: string
  #call: Signal<ToolCallPart<T["name"], ParamsOf<T> | string>>
  #result: Signal<ToolResult<MetaOf<T>> | undefined>
  #pending?: Accessor<boolean>
  #collapsed?: Reactive<boolean>
  #closed = signal(false)
  #stopParsing: () => void
  #params: Signal<ToolViewParams<T>> = signal({})
  #args = memo(() => {
    const { description: desc, ...params } = this.#params.get()
    return { desc: typeof desc === "string" ? desc : "", params: params as Partial<ParamsOf<T>> }
  })

  constructor(opts: ToolViewOpts<T>) {
    this.name = opts.call.name
    this.cwd = opts.cwd
    this.#call = signal(opts.call)
    this.#result = signal(opts.result)
    this.#pending = opts.pending
    this.#collapsed = opts.collapsed

    const repair = throttle(() => {
      if (this.#closed.get()) return
      const args = untrack(() => this.call.params)
      if (typeof args !== "string" || args.trim() === "") return
      const parsed = safeParseToolParams<Tool<ToolViewParams<T>>>(args)
      if (parsed && !Array.isArray(parsed)) {
        this.#params.set(parsed)
        return
      }
      void parseJson(args).then((result) => {
        if (this.#closed.get() || untrack(() => this.call.params) !== args || !result.success)
          return
        const value = result.data
        if (value && typeof value === "object" && !Array.isArray(value))
          this.#params.set(value as ToolViewParams<T>)
      })
    }, 100)

    this.#stopParsing = effect(() => {
      const args = this.call.params
      if (typeof args === "string") {
        untrack(repair)
      } else {
        const parsed = safeParseToolParams<Tool<ToolViewParams<T>>>(args)
        if (parsed && !Array.isArray(parsed)) this.#params.set(parsed)
      }
    })
  }

  /** Freeze the displayed state and ignore outstanding argument repairs. */
  close(): void {
    if (this.#closed.get()) return
    this.#closed.set(true)
    this.#stopParsing()
  }

  get params(): Partial<ParamsOf<T>> {
    return this.#args().params
  }

  get desc() {
    return this.#args().desc
  }

  get collapsed() {
    return unwrap(this.#collapsed) ?? false
  }

  get pending() {
    return !this.#closed.get() && (unwrap(this.#pending) ?? false)
  }

  get call() {
    return this.#call.get()
  }

  set call(value: ToolCallPart<T["name"], ParamsOf<T> | string>) {
    if (this.#closed.get()) return
    if (value.name !== this.name)
      throw new Error(`ToolView: call name mismatch\n- was: ${this.name}\n- now: ${value.name}`)
    this.#call.set(value)
  }

  get result() {
    return this.#result.get()
  }

  set result(value: ToolResult<MetaOf<T>> | undefined) {
    if (!this.#closed.get()) this.#result.set(value)
  }
}

export const toolCall = widget((view: Readonly<ToolView>) => {
  onCleanup(() => view.close())
  const renderer = toolRenderer(view.name)
  const status = memo((): BubbleType => {
    if (view.result === undefined) return "tool_pending"
    return view.result.isError ? "tool_error" : "tool_success"
  })
  const isError = memo(() => view.result?.isError ?? false)
  const showResult = memo(() => !view.collapsed && view.result !== undefined)

  return bubble(
    { pending: memo(() => view.pending), type: status },
    box(
      { flexDirection: "column" },
      renderer.call(view),
      show({ when: memo(() => view.desc) }, () => text(({ style }) => style.dim(view.desc))),
      show(
        {
          use: () =>
            log({
              content: memo(() => view.result?.error?.message ?? "Unknown error"),
              cwd: view.cwd,
              level: "error",
            }),
          when: isError,
        },
        { use: () => renderer.result(view), when: showResult }
      )
    )
  )
})
