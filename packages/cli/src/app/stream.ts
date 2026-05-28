import type { Message, ToolResult } from "@zaly/ai"
import type { Setter } from "@zaly/tui"
import type { ToolCallProps } from "../widgets/tool.ts"
import type { App } from "./app.ts"

import { signal } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCalls } from "../widgets/tool.ts"
import { messageWidgets } from "./message.ts"

interface ActiveTools {
  setDone: Setter<boolean>
  results: Map<string, Setter<ToolResult | undefined>>
}

interface ActiveWidget {
  type: "text" | "reasoning"
  setContent: Setter<string>
  setPending?: Setter<boolean>
}

/**
 * Bridge: live agent events → renderer.stream appends. Owns the
 * in-flight assistant bubble's signal and a map of pending tool-call
 * setters so results can flip them to ✓/✗.
 *
 * Historical replay is `app/replay.ts`'s job — this module only handles
 * the live event stream after the agent is wired up. Pass an
 * AbortSignal via `opts` to detach every handler in one shot.
 */
export function bindStream(app: App, opts?: { signal?: AbortSignal }): void {
  const { agent, renderer, composer } = app
  let active: ActiveWidget | undefined
  let tools: ActiveTools | undefined

  const pendingMessages = new Map<
    string,
    { setPending?: Setter<boolean>; setMessage?: Setter<Message<"user">> }
  >()

  const clearActive = (): void => {
    active?.setPending?.(false)
    active = undefined
  }

  const update = (type: "text" | "reasoning", delta: string): void => {
    if (active?.type !== type) clearActive()
    if (!active) {
      const [content, setContent] = signal("")
      const [pending, setPending] = signal(true)
      renderer.stream.append(() =>
        type === "text"
          ? assistantMessage({ content, pending })
          : reasoningMessage({ content, pending })
      )
      active = { setContent, setPending, type }
    }
    active.setContent((prev) => prev + delta)
  }

  agent.session.on(
    "node",
    ({ node }) => {
      if (node.type !== "message") return
      const id = node.message.id
      if (!id) return
      pendingMessages.get(id)?.setPending?.(false)
      if (node.message.role === "user") pendingMessages.get(id)?.setMessage?.(node.message)
      pendingMessages.delete(id)
    },
    opts
  )

  agent
    .on(
      "pending",
      ({ messages }) => {
        for (const mf of messageWidgets(messages, {
          composer,
          pending: true,
        })) {
          pendingMessages.set(mf.id, { setMessage: mf.setMessage, setPending: mf.setPending })
          for (const w of mf.widgets) renderer.stream.append(w)
        }
      },
      opts
    )
    .on(
      "stream-event",
      ({ event }) => {
        if (event.type === "reasoning-delta" && event.delta !== "") {
          update("reasoning", event.delta)
        } else if (event.type === "text-delta" && event.delta !== "") {
          update("text", event.delta)
        }
      },
      opts
    )
    .on(
      "tool-calls",
      ({ calls }) => {
        clearActive()
        const [done, setDone] = signal(false)
        tools = { results: new Map(), setDone }
        const children: ToolCallProps[] = []

        for (const call of calls) {
          const [result, setResult] = signal<ToolResult | undefined>(undefined)
          tools.results.set(call.id, setResult)
          children.push({ call, result })
        }
        renderer.stream.append(() => toolCalls({ calls: children, done }))
      },
      opts
    )
    .on("tool-result", ({ call, result }) => tools?.results.get(call.id)?.(result), opts)
    .on(
      "step-end",
      () => {
        clearActive()
        tools?.setDone(true)
        tools = undefined
      },
      opts
    )
}
