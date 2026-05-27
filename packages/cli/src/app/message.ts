import type { Message, ToolResultPart } from "@zaly/ai"
import type { Accessor, Node, Setter } from "@zaly/tui"

import { uuidv7 } from "@zaly/agent"
import { toParts } from "@zaly/ai"
import { signal, toAccessor } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCall } from "../widgets/tool.ts"
import { userMessage } from "../widgets/user.ts"

export type MessageWidgets = {
  id: string
  widgets: (() => Node)[]
  setPending?: Setter<boolean>
}

export function messageWidgets(
  messages: readonly Message[],
  opts: { pending: true }
): (MessageWidgets & { setPending: Setter<boolean> })[]
export function messageWidgets(
  messages: readonly Message[],
  opts?: { pending: false }
): Omit<MessageWidgets, "setPending">[]
export function messageWidgets(
  messages: readonly Message[],
  opts?: { pending?: boolean }
): MessageWidgets[] {
  const ret: MessageWidgets[] = []
  // Pre-index tool results by call id. Single pass — tool messages
  // always follow their assistant in the conversation, but the index
  // decouples us from that ordering assumption.
  const results = new Map<string, ToolResultPart>()
  for (const m of messages) {
    if (m.role !== "tool") continue
    for (const part of m.content) results.set(part.id, part)
  }

  for (const m of messages) {
    if (m.hidden) continue
    m.id ??= uuidv7()
    const p = opts?.pending ? signal(true) : undefined
    if (m.role === "user") {
      ret.push({
        id: m.id,
        setPending: p?.set,
        widgets: [() => userMessage({ message: m, pending: p?.get })],
      })
    } else if (m.role === "assistant") {
      ret.push({
        id: m.id,
        setPending: p?.set,
        widgets: [...renderAssistant(m, results, p?.get)],
      })
    }
  }
  return ret
}

function* renderAssistant(
  msg: Message<"assistant">,
  results: Map<string, ToolResultPart>,
  pending?: Accessor<boolean>
): Generator<() => Node> {
  for (const part of toParts(msg.content)) {
    if (part.type === "text" && part.text !== "") {
      yield () => assistantMessage({ content: part.text, pending })
    } else if (part.type === "reasoning" && part.text !== "") {
      yield () => reasoningMessage({ content: part.text, pending })
    } else if (part.type === "tool-call") {
      yield () => toolCall({ call: part, pending, result: toAccessor(results.get(part.id)) })
    }
  }
}
