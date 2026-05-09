import type { Agent } from "@zaly/agent"
import type {
  Attachment,
  Message,
  StreamEvent,
  ToolCallPart,
  ToolResult,
  ToolResultPart,
} from "@zaly/ai"
import type { Renderer } from "@zaly/tui"

import { isAttachment, justText, toParts } from "@zaly/ai"
import { signal, toAccessor } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCall } from "../widgets/tool.ts"
import { userMessage } from "../widgets/user.ts"

export interface StreamHandle {
  pushUser: (content: string, attachments?: readonly Attachment[]) => void
  /** Replay a slice of the loaded session into the stream surface so a
   *  resumed conversation isn't visually empty. Renders each message
   *  with its existing widget (`userMessage`, `assistantMessage`,
   *  `toolCall`); tool calls land already-resolved by pre-pairing them
   *  with their result parts. System messages (heartbeats, wakeups)
   *  are skipped. */
  replay: (messages: readonly Message[]) => void
  dispose: () => void
}

/** Local handle on the in-flight assistant text bubble. The bubble's
 *  content is a signal; deltas append via the setter. */
interface ActiveText {
  setContent: (next: string | ((prev: string) => string)) => void
}

interface ActiveReasoning {
  setContent: (next: string | ((prev: string) => string)) => void
}

interface ActiveTool {
  setResult: (next: ToolResult | undefined) => void
}

/**
 * Bridge: agent events → renderer.stream surface. Owns the in-flight
 * assistant bubble's signal and a map of pending tool-call setters so
 * results can flip them to ✓/✗.
 */
export function bindStream(renderer: Renderer, agent: Agent): StreamHandle {
  let active: ActiveText | undefined
  let activeReasoning: ActiveReasoning | undefined
  const tools = new Map<string, ActiveTool>()

  const ensureBubble = (): ActiveText => {
    if (active) return active
    const [content, setContent] = signal("")
    renderer.stream.append(assistantMessage({ content }))
    const handle: ActiveText = { setContent }
    active = handle
    return handle
  }

  const ensureReasoning = (): ActiveReasoning => {
    if (activeReasoning) return activeReasoning
    const [content, setContent] = signal("")
    renderer.stream.append(reasoningMessage({ content }))
    const handle: ActiveReasoning = { setContent }
    activeReasoning = handle
    return handle
  }

  const onStream = (e: { event: StreamEvent }): void => {
    if (e.event.type === "reasoning-delta" && e.event.delta !== "") {
      // Reasoning streams come before (or interleave with) text on
      // models that emit it. Close the active text bubble so a
      // later text-delta opens a fresh one below the reasoning.
      active = undefined
      const delta = e.event.delta
      ensureReasoning().setContent((prev) => prev + delta)
      return
    }
    if (e.event.type === "text-delta" && e.event.delta !== "") {
      // Text supersedes reasoning — close the reasoning bubble so it
      // doesn't get re-opened by a later reasoning chunk in the same
      // turn (rare but possible). The next reasoning event would
      // start a fresh bubble below the text.
      activeReasoning = undefined
      const delta = e.event.delta
      ensureBubble().setContent((prev) => prev + delta)
    }
  }
  const onCall = (e: { call: ToolCallPart }): void => {
    active = undefined
    activeReasoning = undefined
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
    pushUser(content, attachments) {
      active = undefined
      activeReasoning = undefined
      renderer.stream.append(userMessage({ attachments, content }))
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
          const text = justText(m.content)
          const attachments = toParts(m.content).filter((p) => isAttachment(p))
          if (text !== "" || attachments.length > 0) {
            renderer.stream.append(userMessage({ attachments, content: text }))
          }
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
  for (const part of toParts(msg.content)) {
    if (part.type === "text" && part.text !== "") {
      renderer.stream.append(assistantMessage({ content: part.text }))
    } else if (part.type === "reasoning" && part.text !== "") {
      renderer.stream.append(reasoningMessage({ content: part.text }))
    } else if (part.type === "tool-call") {
      renderer.stream.append(toolCall({ call: part, result: toAccessor(results.get(part.id)) }))
    }
  }
}
