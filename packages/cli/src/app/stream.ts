import type { Agent } from "@zaly/agent"
import type { StreamEvent, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Renderer, Setter } from "@zaly/tui"

import { signal } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCall } from "../widgets/tool.ts"

interface ActiveTool {
  setResult: (next: ToolResult | undefined) => void
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
  const tools = new Map<string, ActiveTool>()

  const update = (type: "text" | "reasoning", delta: string): void => {
    if (active?.type !== type) active = undefined
    if (!active) {
      const [content, setContent] = signal("")
      renderer.stream.append(
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

  const onCall = (e: { call: ToolCallPart }): void => {
    active = undefined
    const [result, setResult] = signal<ToolResult | undefined>(undefined)
    renderer.stream.append(toolCall({ call: e.call, result }))
    tools.set(e.call.id, { setResult })
  }

  const onResult = (e: { call: ToolCallPart; result: ToolResult }): void => {
    tools.get(e.call.id)?.setResult(e.result)
    tools.delete(e.call.id)
  }

  const onStep = (): void => {
    active = undefined
  }

  agent.on("stream-event", onStream)
  agent.on("tool-call", onCall)
  agent.on("tool-result", onResult)
  agent.on("step-end", onStep)

  return () => {
    agent.off("stream-event", onStream)
    agent.off("tool-call", onCall)
    agent.off("tool-result", onResult)
    agent.off("step-end", onStep)
  }
}
