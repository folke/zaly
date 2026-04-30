import type { Agent } from "@zaly/agent"
import type { Message, StreamEvent, ToolCallPart, ToolResult, ToolResultPart } from "@zaly/ai"
import type { Renderer } from "@zaly/tui"

import { stringifyContent } from "@zaly/ai"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCall } from "../widgets/tool.ts"
import { userMessage } from "../widgets/user.ts"

export interface StreamHandle {
  pushUser: (content: string) => void
  /** Replay a slice of the loaded session into the stream surface so a
   *  resumed conversation isn't visually empty. Renders each message
   *  with its existing widget (`userMessage`, `assistantMessage`,
   *  `toolCall`); tool calls land already-resolved by pre-pairing them
   *  with their result parts. System messages (heartbeats, wakeups)
   *  are skipped. */
  replay: (messages: readonly Message[]) => void
  dispose: () => void
}

/**
 * Bridge: agent events → renderer.stream surface. Owns the in-flight
 * assistant bubble and the map of pending tool-call nodes so results
 * can flip them to ✓/✗.
 */
export function bindStream(renderer: Renderer, agent: Agent): StreamHandle {
  let active: ReturnType<typeof assistantMessage> | undefined
  let activeReasoning: ReturnType<typeof reasoningMessage> | undefined
  const tools = new Map<string, ReturnType<typeof toolCall>>()

  const ensureBubble = (): ReturnType<typeof assistantMessage> => {
    if (!active) {
      active = assistantMessage("")
      renderer.stream.append(active.node)
    }
    return active
  }

  const ensureReasoning = (): ReturnType<typeof reasoningMessage> => {
    if (!activeReasoning) {
      activeReasoning = reasoningMessage()
      renderer.stream.append(activeReasoning.node)
    }
    return activeReasoning
  }

  const onStream = (e: { event: StreamEvent }): void => {
    if (
      e.event.type === "reasoning-delta" &&
      typeof e.event.delta === "string" &&
      e.event.delta !== ""
    ) {
      // Reasoning streams come before (or interleave with) text on
      // models that emit it. Close the active text bubble so a
      // later text-delta opens a fresh one below the reasoning.
      active = undefined
      ensureReasoning().append(e.event.delta)
      return
    }
    if (
      e.event.type === "text-delta" &&
      typeof e.event.delta === "string" &&
      e.event.delta !== ""
    ) {
      // Text supersedes reasoning — close the reasoning bubble so it
      // doesn't get re-opened by a later reasoning chunk in the same
      // turn (rare but possible). The next reasoning event would
      // start a fresh bubble below the text.
      activeReasoning = undefined
      const { inner } = ensureBubble()
      inner.state.content += e.event.delta
    }
  }
  const onCall = (e: { call: ToolCallPart }): void => {
    active = undefined
    activeReasoning = undefined
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
    activeReasoning = undefined
  }

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
      activeReasoning = undefined
      renderer.stream.append(userMessage(content))
    },
    replay(messages) {
      // Pre-index tool results by call id so each assistant tool-call
      // can render in its already-resolved state. Single pass — tool
      // messages always follow their assistant in the conversation,
      // but the index decouples us from that ordering assumption.
      const results = new Map<string, ToolResultPart>()
      for (const m of messages) {
        if (m.role !== "tool") continue
        for (const part of m.content) results.set(part.id, part)
      }
      for (const m of messages) {
        if (m.role === "user") {
          const text = stringifyContent(m.content)
          if (text !== "") renderer.stream.append(userMessage(text))
        } else if (m.role === "assistant") {
          renderAssistant(renderer, m, results)
        }
        // system + tool: skipped here. system messages are heartbeats /
        // wakeups (not useful chrome on resume); tool messages render
        // via the assistant's tool-call widget paired by id above.
      }
      // Reset live-streaming state so the next real event creates a
      // fresh bubble after the replayed history.
      active = undefined
      activeReasoning = undefined
    },
  }
}

function renderAssistant(
  renderer: Renderer,
  msg: Message<"assistant">,
  results: Map<string, ToolResultPart>
): void {
  if (typeof msg.content === "string") {
    if (msg.content !== "") {
      const { node } = assistantMessage(msg.content)
      renderer.stream.append(node)
    }
    return
  }
  // Walk parts in order, accumulating text into a single bubble and
  // breaking out for each tool-call / reasoning block so the rendering
  // matches what the live event stream produces.
  let textBuffer = ""
  let reasoningBuffer = ""
  const flushText = (): void => {
    if (textBuffer === "") return
    const { node } = assistantMessage(textBuffer)
    renderer.stream.append(node)
    textBuffer = ""
  }
  const flushReasoning = (): void => {
    if (reasoningBuffer === "") return
    const r = reasoningMessage(reasoningBuffer)
    renderer.stream.append(r.node)
    reasoningBuffer = ""
  }
  for (const part of msg.content) {
    if (part.type === "text") {
      flushReasoning()
      textBuffer += part.text
    } else if (part.type === "reasoning") {
      flushText()
      reasoningBuffer += part.text
    } else {
      // tool-call — exhaustive against assistant content's part union.
      flushReasoning()
      flushText()
      const t = toolCall(part)
      renderer.stream.append(t.node)
      const result = results.get(part.id)
      if (result !== undefined) {
        t.resolve({
          content: result.content,
          error: result.error,
          isError: result.isError ?? false,
          meta: result.meta,
        })
      }
    }
  }
  flushReasoning()
  flushText()
}
