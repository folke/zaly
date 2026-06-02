import type { AgentStatus, AgentStop, PromptLoader, SendMode } from "@zaly/agent"
import type { Content, Message, TokenCount } from "@zaly/ai"
import type { Plugin } from "../plugin.ts"

import { toLoader } from "../plugin.ts"

function isMessage(obj: unknown): obj is Message {
  return typeof obj === "object" && obj !== null && "role" in obj && "content" in obj
}

export class AgentApi {
  #plugin: Plugin

  constructor(plugin: Plugin) {
    this.#plugin = plugin
  }

  get #ctx() {
    return this.#plugin.ctx
  }

  get messages(): readonly Message[] {
    return this.#ctx.agent.messages
  }

  get usage(): TokenCount {
    return this.#ctx.agent.usage
  }

  get contextSize(): number {
    return this.#ctx.agent.contextSize
  }

  get cwd() {
    return this.#ctx.cwd
  }

  get status(): AgentStatus | undefined {
    return this.#ctx.status
  }

  get lastStop(): AgentStop | undefined {
    return this.#ctx.agent.lastStop
  }

  send(
    content: Content | Message | Message[],
    opts: { mode?: SendMode; run?: boolean } = {}
  ): void {
    this.#plugin.assertLoaded()
    const messages: Message[] = []
    if (typeof content === "string") messages.push({ content, role: "user" })
    else if (Array.isArray(content)) {
      if (content.every(isMessage)) messages.push(...content)
      else messages.push({ content, role: "user" })
    } else messages.push(content)
    this.#ctx.agent.send(messages, opts)
  }

  notify(type: string, data: Content | Record<string, unknown>): void {
    this.#plugin.assertLoaded()
    this.#ctx.agent.notify(type, data)
  }

  stop(opts: { abort?: boolean; reason?: string } = {}): void {
    this.#plugin.assertLoaded()
    this.#ctx.agent.stop(opts)
  }

  waitIdle(timeout?: number): Promise<AgentStatus> {
    this.#plugin.assertLoaded()
    return this.#ctx.agent.waitIdle(timeout)
  }

  compact(): Promise<void> {
    this.#plugin.assertLoaded()
    return this.#ctx.agent.compact()
  }

  async registerPrompt(name: string, prompt: string | PromptLoader) {
    this.#plugin.assertLoaded()
    const { promptRegistry } = await import("@zaly/agent")
    this.#plugin.cleanup(promptRegistry.register(name, toLoader(prompt)))
  }
}
