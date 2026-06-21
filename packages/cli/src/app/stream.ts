import type { Message, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Setter } from "@zaly/tui"
import type { ToolCallProps } from "../widgets/tool.ts"
import type { App } from "./app.ts"

import { signal } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { compactionMarker } from "../widgets/compaction.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCalls } from "../widgets/tool.ts"
import { messageWidgets } from "./message.ts"

type StreamingWidget =
  | {
      type: "text" | "reasoning"
      setContent: Setter<string>
      setPending: Setter<boolean>
    }
  | {
      type: "tools"
      setPending: Setter<boolean>
      setResult: (callId: string, result: ToolResult) => void
    }
  | {
      type: "message"
      setPending: Setter<boolean>
      setMessage?: (m: Message<"user">) => void
    }

type ForType<T extends StreamingWidget["type"]> = Extract<StreamingWidget, { type: T }>

class AgentStream {
  #active?: StreamingWidget
  #ac?: AbortController
  #pending = new Map<string, ForType<"message">>()

  constructor(public app: App) {
    this.attach()
  }

  flush(): void {
    this.#active?.setPending(false)
    this.#active = undefined
  }

  reset(): void {
    this.#ac?.abort()
    this.flush()
    for (const pending of this.#pending.values()) pending.setPending(false)
    this.#pending.clear()
  }

  set active(widget: StreamingWidget | undefined) {
    this.flush()
    this.#active = widget
  }

  get<T extends StreamingWidget["type"]>(type: T): ForType<T> | undefined {
    return this.#active?.type === type ? (this.#active as ForType<T>) : undefined
  }

  onToolCalls(calls: ToolCallPart[]): void {
    const [pending, setPending] = signal(true)
    const results = new Map<string, Setter<ToolResult | undefined>>()
    const children: ToolCallProps[] = []

    for (const call of calls) {
      const [result, setResult] = signal<ToolResult | undefined>(undefined)
      results.set(call.id, setResult)
      children.push({ call, result })
    }
    this.app.renderer.stream.append(() => toolCalls({ calls: children, pending }))
    this.active = {
      setPending,
      setResult(callId, result) {
        results.get(callId)?.(result)
      },
      type: "tools",
    }
  }

  onToolResult(call: ToolCallPart, result: ToolResult): void {
    this.get("tools")?.setResult(call.id, result)
  }

  onDelta(type: "text" | "reasoning", delta: string): void {
    let active = this.get(type)
    if (!active) {
      const [content, setContent] = signal("")
      const [pending, setPending] = signal(true)
      this.app.renderer.stream.append(() =>
        type === "text"
          ? assistantMessage({ content, pending })
          : reasoningMessage({ content, pending })
      )
      active = { setContent, setPending, type }
      this.active = active
    }
    active.setContent((prev) => prev + delta)
  }

  onPending(messages: readonly Message[]): void {
    for (const mf of messageWidgets(messages, {
      composer: this.app.composer,
      pending: true,
      reasoning: this.app.config.settings.ui?.reasoning ?? true,
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
        if (node.type !== "message") return
        this.onMessage(node.message)
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
        if (event.type === "reasoning-delta" && event.delta !== "") {
          this.onDelta("reasoning", event.delta)
        } else if (event.type === "text-delta" && event.delta !== "") {
          this.onDelta("text", event.delta)
        }
      },
      opts
    )
    agent.on("tool-calls", ({ calls }) => this.onToolCalls(calls), opts)
    agent.on("tool-result", ({ call, result }) => this.onToolResult(call, result), opts)
    agent.on("step-end", () => this.flush(), opts)
    return this
  }
}

/**
 * Bridge: live agent events → renderer.stream appends. Owns the
 * in-flight assistant bubble's signal and a map of pending tool-call
 * setters so results can flip them to ✓/✗.
 */
export function attachStream(app: App): AgentStream {
  return new AgentStream(app)
}
