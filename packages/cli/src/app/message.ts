import type { Message, ToolResultPart } from "@zaly/ai"
import type { Accessor, Node, Setter } from "@zaly/tui"
import type { Composer } from "./composer.ts"

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
  setMessage?: Setter<Message<"user">>
}

export function messageWidgets(
  messages: readonly Message[],
  opts?: { pending?: boolean; composer?: Composer; reasoning?: boolean }
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
    const [pending, setPending] = opts?.pending ? signal(true) : []
    if (m.role === "user") {
      const [message, setMessage] = signal<Message<"user">>(m)
      ret.push({
        id: m.id,
        setMessage,
        setPending,
        widgets: [
          () =>
            userMessage({
              composer: opts?.composer,
              message,
              pending,
            }),
        ],
      })
    } else if (m.role === "assistant") {
      const widgets = [...renderAssistant(m, results, pending)]
      if (widgets.length === 0) continue
      ret.push({
        id: m.id,
        setPending,
        widgets,
      })
    }
  }
  return ret
}

function* renderAssistant(
  msg: Message<"assistant">,
  results: Map<string, ToolResultPart>,
  pending?: Accessor<boolean>,
  opts?: { reasoning?: boolean }
): Generator<() => Node> {
  for (const part of toParts(msg.content)) {
    if (part.type === "text" && part.text !== "") {
      yield () => assistantMessage({ content: part.text, pending })
    } else if (part.type === "reasoning" && part.text !== "" && opts?.reasoning !== false) {
      yield () => reasoningMessage({ content: part.text, pending })
    } else if (part.type === "tool-call") {
      yield () => toolCall({ call: part, pending, result: toAccessor(results.get(part.id)) })
    }
  }
}
