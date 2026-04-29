import type { Agent } from "@zaly/agent"
import type { StreamEvent, ToolCallPart, ToolResult } from "@zaly/ai"
import type { Renderer } from "@zaly/tui"

import { assistantMessage } from "../widgets/assistant.ts"
import { toolCall } from "../widgets/tool.ts"
import { userMessage } from "../widgets/user.ts"

export interface StreamHandle {
  pushUser: (content: string) => void
  dispose: () => void
}

/**
 * Bridge: agent events → renderer.stream surface. Owns the in-flight
 * assistant bubble and the map of pending tool-call nodes so results
 * can flip them to ✓/✗.
 */
export function bindStream(renderer: Renderer, agent: Agent): StreamHandle {
  let active: ReturnType<typeof assistantMessage> | undefined
  const tools = new Map<string, ReturnType<typeof toolCall>>()

  const ensureBubble = (): ReturnType<typeof assistantMessage> => {
    if (!active) {
      active = assistantMessage("")
      renderer.stream.append(active.node)
    }
    return active
  }

  const onStream = (e: { event: StreamEvent }): void => {
    if (
      e.event.type === "text-delta" &&
      typeof e.event.delta === "string" &&
      e.event.delta !== ""
    ) {
      const { inner } = ensureBubble()
      inner.state.content += e.event.delta
    }
  }
  const onCall = (e: { call: ToolCallPart }): void => {
    active = undefined
    const t = toolCall(e.call)
    tools.set(e.call.id, t)
    renderer.stream.append(t.node)
  }
  const onResult = (e: { call: ToolCallPart; result: ToolResult }): void => {
    tools.get(e.call.id)?.resolve(e.result)
    tools.delete(e.call.id)
  }
  const onStep = (): void => {
    active = undefined
  }

  setTimeout(() => {
    console.error("test")
  }, 1000)

  agent.on("stream-event", onStream)
  agent.on("tool-call", onCall)
  agent.on("tool-result", onResult)
  agent.on("step-end", onStep)

  return {
    dispose() {
      agent.off("stream-event", onStream)
      agent.off("tool-call", onCall)
      agent.off("tool-result", onResult)
      agent.off("step-end", onStep)
    },
    pushUser(content) {
      active = undefined
      renderer.stream.append(userMessage(content))
    },
  }
}
