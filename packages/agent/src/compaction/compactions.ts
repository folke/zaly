import type { Message, ReasoningOptions } from "@zaly/ai"
import type { Agent } from "../agent.ts"
import type { Session } from "../session/index.ts"
import type { ToolStatOptions } from "./utils.ts"

import { collect, toXml } from "@zaly/ai"
import { SUMMARY_HEADER, SUMMARY_PROMPT, SYSTEM_PROMPT } from "./prompt.ts"
import {
  extractBashUsage,
  extractConversation,
  extractFileUsage,
  formatBashUsage,
  formatFileUsage,
  messageTail,
} from "./utils.ts"

export type CompactionContext = {
  messages: readonly Message[]
  session: Session
}

export type CompactionOptions = {
  auto: boolean
  treshold?: number
  /** Existing messages up to this many tokens will be preserved in the context */
  keepTokens: number
  maxToolResultLen: number
  maxSummaryTokens: number
  bash: ToolStatOptions
  files: ToolStatOptions
  signal?: AbortSignal
  reasoning?: ReasoningOptions
  trigger?: "manual" | "auto"
}

const defaults: CompactionOptions = {
  auto: true,
  bash: { limit: 50, minCount: 2, minScore: 0.5, sort: "score" },
  files: { limit: 50, minCount: 1, minScore: 0.5, sort: "score" },
  keepTokens: 20_000,
  maxSummaryTokens: 10_000,
  maxToolResultLen: 2000,
  reasoning: { effort: "low" },
  treshold: 0.85,
}

export class Compaction {
  #opts: CompactionOptions
  #agent: Agent

  constructor(agent: Agent, opts: Partial<CompactionOptions> = {}) {
    this.#agent = agent
    this.#opts = { ...defaults, ...opts }
  }

  async compact(): Promise<void> {
    const { session, messages } = this.#agent

    const now = performance.now()

    const tail = await messageTail({ messages, session }, { keepTokens: this.#opts.keepTokens })
    const older = tail.length > 0 ? messages.slice(0, -tail.length) : messages

    if (older.length === 0) return

    const conversation = extractConversation(
      // Conversation summary is based on the older messages, not the tail — the tail is what we keep
      { messages: older, session },
      { maxToolResultLen: this.#opts.maxToolResultLen }
    )

    const bashUsage = formatBashUsage(extractBashUsage({ messages, session }, this.#opts.bash))
    const fileUsage = formatFileUsage(
      await extractFileUsage({ messages, session }, this.#opts.files)
    )

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
      role: "system",
    }
    await session.compact({
      durationMs: Math.round(performance.now() - now),
      preTokens: this.#agent.contextSize,
      summary: summaryMessage,
      tail: tail.length,
      trigger: this.#opts.trigger,
    })
  }

  async #summarize(message: Message<"user">): Promise<string> {
    const model = this.#agent.model

    const ret = await collect(
      model.stream(
        {
          messages: [message],
          prompt: [SYSTEM_PROMPT],
        },
        {
          maxTokens: this.#opts.maxSummaryTokens,
          reasoning: this.#opts.reasoning,
          signal: this.#opts.signal,
        }
      )
    )
    const m = ret.message
    if (typeof m.content === "string") return m.content
    const parts = m.content.filter((p) => p.type === "text").map((p) => p.text)
    return parts.join("\n")
  }
}
