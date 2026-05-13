import type { Agent } from "@zaly/agent"
import type { StreamEvent, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Renderer, Setter, Signal } from "@zaly/tui"
import type { ToolCallProps } from "../widgets/tool.ts"

import { signal } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCalls } from "../widgets/tool.ts"

interface ActiveTools {
  done: Signal<boolean>
  results: Map<string, Setter<ToolResult | undefined>>
}

interface ActiveWidget {
  type: "text" | "reasoning"
  setContent: Setter<string>
}

/**
 * Bridge: live agent events → renderer.stream appends. Owns the
 * in-flight assistant bubble's signal and a map of pending tool-call
 * setters so results can flip them to ✓/✗.
 *
 * Historical replay is `app/replay.ts`'s job — this module only handles
 * the live event stream after the agent is wired up. Returns a dispose
 * function that detaches every handler.
 */
export function bindStream(renderer: Renderer, agent: Agent): () => void {
  let active: ActiveWidget | undefined
  let tools: ActiveTools | undefined

  const update = (type: "text" | "reasoning", delta: string): void => {
    if (active?.type !== type) active = undefined
    if (!active) {
      const [content, setContent] = signal("")
      renderer.stream.append(() =>
        type === "text" ? assistantMessage({ content }) : reasoningMessage({ content })
      )
      active = { setContent, type }
    }
    active.setContent((prev) => prev + delta)
  }

  const onStream = (e: { event: StreamEvent }): void => {
    if (e.event.type === "reasoning-delta" && e.event.delta !== "") {
      update("reasoning", e.event.delta)
    } else if (e.event.type === "text-delta" && e.event.delta !== "") {
      update("text", e.event.delta)
    }
  }

  const onCalls = (e: { calls: ToolCallPart[] }): void => {
    active = undefined
    const done = signal(false)
    tools = { done, results: new Map() }
    const children: ToolCallProps[] = []

    for (const call of e.calls) {
      const [result, setResult] = signal<ToolResult | undefined>(undefined)
      tools.results.set(call.id, setResult)
      children.push({ call, result })
    }
    renderer.stream.append(() => toolCalls({ calls: children, done: done.get }))
  }

  const onResult = (e: { call: ToolCallPart; result: ToolResult }): void => {
    tools?.results.get(e.call.id)?.(e.result)
  }

  const onStep = (): void => {
    active = undefined
    tools?.done.set(true)
    tools = undefined
  }

  agent.on("stream-event", onStream)
  agent.on("tool-calls", onCalls)
  agent.on("tool-result", onResult)
  agent.on("step-end", onStep)

  return () => {
    agent.off("stream-event", onStream)
    agent.off("tool-calls", onCalls)
    agent.off("tool-result", onResult)
    agent.off("step-end", onStep)
  }
}
