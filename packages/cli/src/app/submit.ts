import type { Agent } from "@zaly/agent"
import type { Attachment, ContentPart, Message, TextPart } from "@zaly/ai"
import type { Renderer } from "@zaly/tui"

import { userMessage } from "../widgets/user.ts"

/**
 * Submit user text + staged attachments. Appends the user widget to
 * the stream (so the bubble shows the text the user typed, including
 * `[Image #n]` / `[PDF #n]` placeholders that render as inline image
 * / PDF widgets), then injects the equivalent `Message` into the
 * agent.
 *
 * Pure-ish: depends on `renderer.stream` and `agent.inject` but holds
 * no state. Caller is responsible for clearing the composer + the
 * attachment buffer around this call.
 */
export function submit(
  text: string,
  attachments: readonly Attachment[],
  agent: Agent,
  renderer: Renderer
): void {
  renderer.stream.append(() => userMessage({ attachments, content: text }))

  const message: Message<"user"> =
    attachments.length === 0
      ? { content: text, role: "user" }
      : {
          content: [{ text, type: "text" } as TextPart, ...attachments] as ContentPart[],
          role: "user",
        }

  agent.inject(message)
}
