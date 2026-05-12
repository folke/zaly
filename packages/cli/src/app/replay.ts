import type { Message, ToolResultPart } from "@zaly/ai"
import type { Node, Renderer } from "@zaly/tui"

import { isAttachment, justText, toParts } from "@zaly/ai"
import { overlay, toAccessor } from "@zaly/tui"
import { assistantMessage } from "../widgets/assistant.ts"
import { reasoningMessage } from "../widgets/reasoning.ts"
import { toolCall } from "../widgets/tool.ts"
import { userMessage } from "../widgets/user.ts"

export async function replay(messages: readonly Message[], renderer: Renderer) {
  const nodes = [...toWidgets(messages)]
  const len = 5
  const tail = nodes.splice(-len, len)

  const over = renderer.overlay
    .add(() =>
      overlay(
        {
          height: renderer.terminal.rows - renderer.ui.height,
          verticalAlign: "bottom",
          width: renderer.terminal.cols,
          x: 0,
          y: 1,
        },
        ...tail.map((node) => node())
      )
    )
    .show()
  await renderer.render()

  await Promise.resolve()

  for (const node of nodes) {
    renderer.stream.append(node)
    // oxlint-disable-next-line no-await-in-loop
    await Promise.resolve()
  }

  await renderer.render()

  renderer.overlay.remove(over)
  //for (const node of over.children) renderer.stream.append(() => node)
  for (const node of tail) renderer.stream.append(node)
}

/**
 * Turn a tail of a session's messages into a stream of widget nodes.
 * Pure: no renderer, no agent. Caller iterates and appends each node
 * to the stream surface.
 *
 * Tool calls are paired with their tool-message results by id, so each
 * `toolCall` widget renders in its already-resolved state. System
 * messages (heartbeats, wakeups) are skipped — they're not useful
 * chrome on resume.
 */
function* toWidgets(messages: readonly Message[]): Generator<() => Node> {
  // Pre-index tool results by call id. Single pass — tool messages
  // always follow their assistant in the conversation, but the index
  // decouples us from that ordering assumption.
  const results = new Map<string, ToolResultPart>()
  for (const m of messages) {
    if (m.role !== "tool") continue
    for (const part of m.content) results.set(part.id, part)
  }

  for (const m of messages) {
    if (m.role === "user") {
      const text = justText(m.content)
      const attachments = toParts(m.content).filter((p) => isAttachment(p))
      if (text === "" && attachments.length === 0) continue
      yield () => userMessage({ attachments, content: text })
    } else if (m.role === "assistant") {
      yield* renderAssistant(m, results)
    }
    // system + tool messages skipped here — system messages are
    // heartbeats / wakeups; tool messages are paired into the
    // assistant's tool-call widget above.
  }
}

function* renderAssistant(
  msg: Message<"assistant">,
  results: Map<string, ToolResultPart>
): Generator<() => Node> {
  for (const part of toParts(msg.content)) {
    if (part.type === "text" && part.text !== "") {
      yield () => assistantMessage({ content: part.text })
    } else if (part.type === "reasoning" && part.text !== "") {
      yield () => reasoningMessage({ content: part.text })
    } else if (part.type === "tool-call") {
      yield () => toolCall({ call: part, result: toAccessor(results.get(part.id)) })
    }
  }
}
