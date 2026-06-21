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
    const { session } = this.#agent

    const masker = await this.#agent.ctx.masker()

    const messages = masker ? masker.mask(session.messages, pressure) : session.messages

    const now = performance.now()

    const tail = messageTail(messages, { keepTokens: this.#opts.keepTokens })
    const older = tail.length > 0 ? messages.slice(0, -tail.length) : messages

    if (older.length === 0) return

    const conversation = extractConversation(
      // Conversation summary is based on the older messages, not the tail — the tail is what we keep
      older,
      { maxToolResultLen: this.#opts.maxToolResultLen }
    )

    const bashUsage = formatBashUsage(extractBashUsage(messages, this.#opts.bash))
    const fileUsage = formatFileUsage(extractFileUsage(messages, this.#opts.files))

    const request: Message<"user"> = {
      content: [
        { text: conversation, type: "text" },
        { text: fileUsage, type: "text" },
        { text: bashUsage, type: "text" },
        { text: SUMMARY_PROMPT, type: "text" },
      ],
      role: "user",
    }

    const summary = await this.#summarize(request)
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
      preTokens: this.#agent.contextSize,
      summary: summaryMessage,
      tail: tail.length,
      trigger: this.#opts.trigger,
    })
    masker?.reset()
  }

  async #summarize(message: Message<"user">): Promise<string> {
    const model = this.#agent.model
    if (!model) throw new Error("model must be loaded to compact")
    const m = await model.stream(
      {
        messages: [message],
        prompt: [SYSTEM_PROMPT],
      },
      {
        caching: false,
        maxTokens: this.#opts.summaryTokens,
        reasoning: this.#opts.reasoning ? { effort: this.#opts.reasoning } : undefined,
        signal: this.#opts.signal,
      }
    )
    if (typeof m.content === "string") return m.content
    const parts = m.content.filter((p) => p.type === "text").map((p) => p.text)
    return parts.join("\n")
  }
}
