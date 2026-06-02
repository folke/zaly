import type { AnyPrompt, Prompt, PromptCollection } from "@zaly/agent"
import type { Collection } from "@zaly/shared/collection"
import type { Plugin } from "../plugin.ts"

export class PromptsApi implements Collection<AnyPrompt[], Prompt[], Prompt> {
  #plugin: Plugin

  constructor(plugin: Plugin) {
    this.#plugin = plugin
  }

  get #prompts(): PromptCollection {
    return this.#plugin.host.prompts
  }

  get active(): string[] {
    return this.#prompts.active
  }

  set active(prompts: string[]) {
    this.#prompts.active = prompts
  }

  async render(prompts?: string[]): Promise<string[]> {
    const model = this.#plugin.ctx.model
    if (!model) return []
    return this.#prompts.render({
      cwd: this.#plugin.ctx.cwd,
      model,
      prompts,
    })
  }

  list(): Prompt[] {
    return this.#prompts.list()
  }

  register(def: Prompt): void {
    this.#plugin.cleanup(this.#prompts.register(def))
  }
}
