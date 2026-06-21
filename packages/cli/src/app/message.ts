import type { Message, ToolResultPart } from "@zaly/ai"
import type { Node, Setter } from "@zaly/tui"
import type { App } from "./app.ts"

import { uuidv7 } from "@zaly/agent"
import { toParts } from "@zaly/ai"
import { signal } from "@zaly/tui"
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

export type MessageWidgetsOpts = {}

export function messageWidgets(
  messages: readonly Message[],
  app: App,
  opts: { pending?: boolean } = {}
): MessageWidgets[] {
  const reasoning = app.settings.ui.reasoning
  const collapsed = new Set(app.settings.ui.collapsedTools)
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
    const [pending, setPending] = opts.pending ? signal(true) : []
    if (m.role === "user") {
      const [message, setMessage] = signal<Message<"user">>(m)
      ret.push({
        id: m.id,
        setMessage,
        setPending,
        widgets: [
          () =>
            userMessage({
              composer: app.composer,
              message,
              pending,
            }),
        ],
      })
    } else if (m.role === "assistant") {
      const widgets = toParts(m.content)
        .map((part) => {
          if (part.type === "text" && part.text !== "")
            return () => assistantMessage({ content: part.text, pending })
          else if (part.type === "reasoning" && part.text !== "" && reasoning)
            return () => reasoningMessage({ content: part.text, pending })
          else if (part.type === "tool-call") {
            return () =>
              toolCall({
                call: part,
                collapsed: collapsed.has(part.name),
                pending,
                result: results.get(part.id),
              })
          }
        })
        .filter((w) => w !== undefined)
      if (widgets.length > 0)
        ret.push({
          id: m.id,
          setPending,
          widgets,
        })
    }
  }
  return ret
}
