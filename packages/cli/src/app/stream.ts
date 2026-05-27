import type { ToolResult } from "@zaly/ai"
import type { Setter, Signal } from "@zaly/tui"
import type { ToolCallProps } from "../widgets/tool.ts"
import type { App } from "./app.ts"

import { signal } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCalls } from "../widgets/tool.ts"
import { messageWidgets } from "./message.ts"

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
 * the live event stream after the agent is wired up. Pass an
 * AbortSignal via `opts` to detach every handler in one shot.
 */
export function bindStream(app: App, opts?: { signal?: AbortSignal }): void {
  const { agent, renderer, composer } = app
  let active: ActiveWidget | undefined
  let tools: ActiveTools | undefined

  const pending = new Map<string, Setter<boolean>>()

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

  agent.session.on(
    "node",
    ({ node }) => {
      if (node.type !== "message") return
      const id = node.message.id
      if (!id) return
      pending.get(id)?.(false)
      pending.delete(id)
    },
    opts
  )

  agent
    .on(
      "pending",
      ({ messages }) => {
        for (const mf of messageWidgets(messages, {
          format: composer.formatter,
          pending: true,
        })) {
          pending.set(mf.id, mf.setPending)
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
        active = undefined
        const done = signal(false)
        tools = { done, results: new Map() }
        const children: ToolCallProps[] = []

        for (const call of calls) {
          const [result, setResult] = signal<ToolResult | undefined>(undefined)
          tools.results.set(call.id, setResult)
          children.push({ call, result })
        }
        renderer.stream.append(() => toolCalls({ calls: children, done: done.get }))
      },
      opts
    )
    .on("tool-result", ({ call, result }) => tools?.results.get(call.id)?.(result), opts)
    .on(
      "step-end",
      () => {
        active = undefined
        tools?.done.set(true)
        tools = undefined
      },
      opts
    )
}
