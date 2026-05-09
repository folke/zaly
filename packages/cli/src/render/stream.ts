import type { Agent } from "@zaly/agent"
import type {
  Attachment,
  Message,
  StreamEvent,
  ToolCallPart,
  ToolResult,
  ToolResultPart,
} from "@zaly/ai"
import type { Renderer, Setter } from "@zaly/tui"

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

interface ActiveTool {
  setResult: (next: ToolResult | undefined) => void
}

interface ActiveWidget {
  type: "text" | "reasoning"
  setContent: Setter<string>
}

/**
 * Bridge: agent events → renderer.stream surface. Owns the in-flight
 * assistant bubble's signal and a map of pending tool-call setters so
 * results can flip them to ✓/✗.
 */
export function bindStream(renderer: Renderer, agent: Agent): StreamHandle {
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

  return {
    dispose() {
      agent.off("stream-event", onStream)
      agent.off("tool-call", onCall)
      agent.off("tool-result", onResult)
      agent.off("step-end", onStep)
    },
    pushUser(content, attachments) {
      active = undefined
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
