import type { Message, StreamEvent, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Setter } from "@zaly/tui"
import type { App } from "./app.ts"

import { signal, toAccessor } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { compactionMarker } from "../widgets/compaction.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCall, ToolView } from "../widgets/tool.ts"
import { messageWidgets } from "./message.ts"

type StreamingWidget =
  | {
      type: "text" | "reasoning"
      setContent: Setter<string>
      setPending: Setter<boolean>
    }
  | {
      type: "message"
      setPending: Setter<boolean>
      setMessage?: (m: Message<"user">) => void
    }

type ForType<T extends StreamingWidget["type"]> = Extract<StreamingWidget, { type: T }>
type ToolDelta = Extract<StreamEvent, { type: "tool-call-delta" }>
type StreamingTool = {
  id?: string
  name?: string
  args: string
  finalized: boolean
  view?: ToolView
}

class AgentStream {
  #active?: StreamingWidget
  #ac?: AbortController
  #pending = new Map<string, ForType<"message">>()
  #tools = new Map<string, StreamingTool>()
  #toolsPending = signal(false)

  constructor(public app: App) {
    this.attach()
  }

  #flushActive(): void {
    this.#active?.setPending(false)
    this.#active = undefined
  }

  flush(): void {
    this.#flushActive()
    this.#toolsPending.set(false)
    for (const entry of this.#tools.values()) entry.view?.close()
    this.#tools.clear()
  }

  reset(): void {
    this.#ac?.abort()
    this.flush()
    for (const pending of this.#pending.values()) pending.setPending(false)
    this.#pending.clear()
  }

  set active(widget: StreamingWidget | undefined) {
    this.#flushActive()
    this.#active = widget
  }

  get<T extends StreamingWidget["type"]>(type: T): ForType<T> | undefined {
    return this.#active?.type === type ? (this.#active as ForType<T>) : undefined
  }

  #entry(key: string): StreamingTool {
    const existing = this.#tools.get(key)
    if (existing) return existing
    this.#toolsPending.set(true)
    const entry: StreamingTool = { args: "", finalized: false }
    this.#tools.set(key, entry)
    return entry
  }

  #appendTool(entry: StreamingTool, call?: ToolCallPart): void {
    if (entry.view || !entry.name) return
    this.#flushActive()
    const name = entry.name
    const initial: ToolCallPart = call ?? {
      id: entry.id ?? "",
      name,
      params: entry.args,
      type: "tool-call",
    }
    const cwd = this.app.agent.ctx.cwd
    this.app.renderer.stream.append(() => {
      const view: ToolView = new ToolView({
        call: initial,
        collapsed: toAccessor(() => this.app.$.ui.collapsedTools.includes(name) || view.pending),
        cwd,
        pending: toAccessor(() => this.#toolsPending.get() && view.result === undefined),
      })
      entry.view = view
      return toolCall(view)
    })
  }

  #findTool(call: ToolCallPart): StreamingTool | undefined {
    const entries = [...this.#tools.values()]
    return (
      entries.find((entry) => entry.id === call.id) ??
      entries.find((entry) => !entry.id && !entry.finalized && entry.name === call.name)
    )
  }

  onToolDelta(event: ToolDelta): void {
    const entry = this.#entry(`delta:${event.key}`)
    if (entry.finalized) return
    entry.id ??= event.id
    if (!entry.name && event.name) entry.name = event.name
    entry.args = event.args ?? entry.args + (event.delta ?? "")
    this.#appendTool(entry)
    const view = entry.view
    if (view && (view.call.params !== entry.args || (entry.id && view.call.id !== entry.id))) {
      view.call = { ...view.call, id: entry.id ?? view.call.id, params: entry.args }
    }
  }

  onToolCall(call: ToolCallPart): void {
    this.#flushActive()
    const entry = this.#findTool(call) ?? this.#entry(`call:${call.id}`)
    entry.id = call.id
    entry.name ??= call.name
    entry.finalized = true
    this.#appendTool(entry, call)
    if (entry.view) entry.view.call = call
  }

  onToolCalls(calls: ToolCallPart[]): void {
    for (const call of calls) this.onToolCall(call)
  }

  onToolResult(call: ToolCallPart, result: ToolResult): void {
    const view = this.#findTool(call)?.view
    if (view) view.result = result
  }

  onDelta(type: "text" | "reasoning", delta: string): void {
    let active = this.get(type)
    if (!active) {
      const [content, setContent] = signal("")
      const [pending, setPending] = signal(true)
      this.app.renderer.stream.append(() =>
        type === "text"
          ? assistantMessage({ content, cwd: this.app.agent.ctx.cwd, pending })
          : reasoningMessage({ content, cwd: this.app.agent.ctx.cwd, pending })
      )
      active = { setContent, setPending, type }
      this.active = active
    }
    active.setContent((prev) => prev + delta)
  }

  onPending(messages: readonly Message[]): void {
    for (const mf of messageWidgets(messages, this.app, {
      cwd: this.app.agent.ctx.cwd,
      pending: true,
    })) {
      if (mf.setPending)
        this.#pending.set(mf.id, {
          setMessage: mf.setMessage,
          setPending: mf.setPending,
          type: "message",
        })
      for (const w of mf.widgets) this.app.renderer.stream.append(w)
    }
  }

  onMessage(message: Message): void {
    const pending = message.id ? this.#pending.get(message.id) : undefined
    if (!pending || !message.id) return
    pending.setPending(false)
    if (message.role === "user") pending.setMessage?.(message)
    this.#pending.delete(message.id)
  }

  attach(): this {
    this.reset()
    this.#ac = new AbortController()
    const opts = { signal: this.#ac.signal }
    const { agent } = this.app
    agent.ctx.on("session", () => this.attach(), opts)
    agent.session.on(
      "node",
      ({ node }) => {
        if (node.type === "message") this.onMessage(node.message)
      },
      opts
    )
    agent.session.on(
      "compact",
      () => this.app.renderer.stream.append(() => compactionMarker()),
      opts
    )
    agent.on("pending", ({ messages }) => this.onPending(messages), opts)
    agent.on(
      "stream-event",
      ({ event }) => {
        if (event.type === "reasoning-delta" && event.delta !== "")
          this.onDelta("reasoning", event.delta)
        else if (event.type === "text-delta" && event.delta !== "")
          this.onDelta("text", event.delta)
        else if (event.type === "tool-call-delta") this.onToolDelta(event)
        else if (event.type === "tool-call") this.onToolCall(event)
      },
      opts
    )
    agent.on("tool-calls", ({ calls }) => this.onToolCalls(calls), opts)
    agent.on("tool-result", ({ call, result }) => this.onToolResult(call, result), opts)
    agent.on("step-end", () => this.flush(), opts)
    agent.on("stop", () => this.flush(), opts)
    return this
  }
}

/** Bridge live agent events to reactive message and tool previews. */
export function attachStream(app: App): AgentStream {
  return new AgentStream(app)
}
