import type { Message, ReasoningEffort } from "@zaly/ai"
import type { Agent } from "../agent.ts"
import type { ContextPressure } from "../types.ts"
import type { ToolStatOptions } from "./utils.ts"

import { toXml } from "@zaly/ai"
import { SUMMARY_HEADER, SUMMARY_PROMPT, SYSTEM_PROMPT } from "./prompt.ts"
import {
  extractBashUsage,
  extractConversation,
  extractFileUsage,
  formatBashUsage,
  formatFileUsage,
  messageTail,
} from "./utils.ts"

export type CompactionOptions = {
  enabled: boolean
  threshold?: number
  /** Prepare and apply automatic compaction without pausing the foreground loop. */
  backgroundEnabled?: boolean
  backgroundThreshold?: number
  /** Existing messages up to this many tokens will be preserved in the context */
  keepTokens: number
  maxToolResultLen: number
  summaryTokens: number
  bash: ToolStatOptions
  files: ToolStatOptions
  signal?: AbortSignal
  reasoning?: ReasoningEffort
  trigger?: "manual" | "auto"
}

const defaults: CompactionOptions = {
  backgroundEnabled: true,
  backgroundThreshold: 0.9,
  bash: { limit: 50, minCount: 2, minScore: 0.5, sort: "score" },
  enabled: true,
  files: { limit: 50, minCount: 1, minScore: 0.5, sort: "score" },
  keepTokens: 20_000,
  maxToolResultLen: 2000,
  reasoning: "low",
  summaryTokens: 10_000,
  threshold: 0.95,
}

export class Compaction {
  #opts: CompactionOptions
  #agent: Agent

  constructor(agent: Agent, opts: Partial<CompactionOptions> = {}) {
    this.#agent = agent
    this.#opts = { ...defaults, ...opts }
  }

  async compact(pressure: ContextPressure): Promise<void> {
    const { session, model } = this.#agent
    if (!model) throw new Error("model must be loaded to compact")

    const masker = await this.#agent.ctx.masker()

    const snapshot = [...session.messages]
    const messages = masker ? await masker.mask(snapshot, pressure) : snapshot

    const now = performance.now()

    const tail = messageTail(messages, { keepTokens: this.#opts.keepTokens })
    const older = tail.length > 0 ? messages.slice(0, -tail.length) : messages

    if (older.length === 0) return
    const to = older.at(-1)?.id
    const from = older[0].id
    if (!to || !from) throw new Error("Compaction snapshot messages must have IDs")

    const conversation = extractConversation(
      // Conversation summary is based on the older messages, not the tail — the tail is what we keep
      older,
      { maxToolResultLen: this.#opts.maxToolResultLen }
    )

    const bashUsage = formatBashUsage(extractBashUsage(older, this.#opts.bash))
    const fileUsage = formatFileUsage(extractFileUsage(older, this.#opts.files))

    const request: Message<"user"> = {
      content: [
        { text: conversation, type: "text" },
        { text: fileUsage, type: "text" },
        { text: bashUsage, type: "text" },
        { text: SUMMARY_PROMPT, type: "text" },
      ],
      role: "user",
    }

    this.#opts.signal?.throwIfAborted()
    const summary = await this.#summarize(request, model, session.id)
    this.#opts.signal?.throwIfAborted()
    if (this.#agent.session !== session) throw new Error("Compaction session changed")
    // The bash + file usage tables are deterministic, ground-truth signals
    // — pricier to ask the model to reproduce than to copy verbatim. Carry
    // them through to the resumed agent so it has the same working-set
    // visibility the summarizer had, without paying for output tokens.
    const summaryMessage: Message<"system"> = {
      content: [
        { text: SUMMARY_HEADER, type: "text" },
        { text: toXml(summary, "compaction-summary", { indent: false }), type: "text" },
        { text: fileUsage, type: "text" },
        { text: bashUsage, type: "text" },
      ],
      meta: { kind: "compaction-summary" },
      role: "system",
    }
    await session.compact({
      durationMs: Math.round(performance.now() - now),
      from,
      preTokens: pressure.used,
      signal: this.#opts.signal,
      summary: summaryMessage,
      to,
      trigger: this.#opts.trigger,
    })
    masker?.reset()
  }

  async #summarize(
    message: Message<"user">,
    model: NonNullable<Agent["model"]>,
    sessionId: string
  ): Promise<string> {
    const m = await model.stream(
      {
        messages: [message],
        prompt: [SYSTEM_PROMPT],
        sessionId,
      },
      {
        caching: false,
        maxTokens: this.#opts.summaryTokens,
        reasoning: this.#opts.reasoning,
        signal: this.#opts.signal,
      }
    )
    if (typeof m.content === "string") return m.content
    const parts = m.content.filter((p) => p.type === "text").map((p) => p.text)
    return parts.join("\n")
  }
}
