import type {
  AgentContext,
  AgentStop,
  AgentStatus,
  AnyPrompt,
  AnyTool,
  ToolLoader,
  PromptLoader,
} from "@zaly/agent"
import type { Content, Message, Tool } from "@zaly/ai"
import type { Plugin } from "./plugin.ts"

import { toLoader } from "./plugin.ts"

export class AgentApi {
  #ctx: AgentContext
  #plugin: Plugin

  constructor(plugin: Plugin) {
    this.#plugin = plugin
    this.#ctx = plugin.ctx
  }

  get signal() {
    return this.#ctx.signal
  }

  get cwd() {
    return this.#ctx.cwd
  }

  get prompt() {
    return this.#ctx.$prompt
  }

  set prompt(p: (string | { template: AnyPrompt })[]) {
    this.#ctx.$prompt = p
  }

  get tools() {
    return this.#ctx.$tools
  }

  set tools(t: (Tool | AnyTool)[]) {
    this.#ctx.$tools = t
  }

  get status(): AgentStatus | undefined {
    return this.#ctx.status
  }

  get lastStop(): AgentStop | undefined {
    return this.#ctx.agent.lastStop
  }

  send(content: Content, opts: { queue?: boolean } = {}): void {
    const message: Message<"user"> = { content, role: "user" }
    if (opts.queue) this.#ctx.agent.send(message)
    else this.#ctx.agent.inject(message)
  }

  notify(type: string, data: Content | Record<string, unknown>): void {
    this.#ctx.agent.notify(type, data)
  }

  stop(opts: { abort?: boolean; reason?: string } = {}): void {
    this.#ctx.agent.stop(opts)
  }

  waitIdle(timeout?: number): Promise<AgentStatus> {
    return this.#ctx.agent.waitIdle(timeout)
  }

  compact(): Promise<void> {
    return this.#ctx.agent.compact()
  }

  async registerTool(name: string, tool: Tool | ToolLoader) {
    const { toolRegistry } = await import("@zaly/agent")
    this.#plugin.cleanup(toolRegistry.register(name, toLoader(tool)))
  }

  async registerPrompt(name: string, prompt: string | PromptLoader) {
    const { promptRegistry } = await import("@zaly/agent")
    this.#plugin.cleanup(promptRegistry.register(name, toLoader(prompt)))
  }
}
