import type { AgentContext } from "@zaly/agent"
import type { AgentApi } from "./agent.ts"
import type { ModelApi } from "./model.ts"

export type PluginApi = {
  agent: AgentApi
  model: ModelApi
}

export class Plugin {
  #cleanup: (() => void)[] = []
  #ctx: AgentContext
  #api?: PluginApi

  constructor(ctx: AgentContext) {
    this.#ctx = ctx
  }

  get ctx() {
    return this.#ctx
  }

  cleanup(fn: () => void): void {
    this.#cleanup.push(fn)
  }

  dispose(): void {
    // LIFO so within-plugin override chains unwind correctly
    while (this.#cleanup.length > 0) this.#cleanup.pop()!()
  }

  async api(): Promise<PluginApi> {
    if (this.#api) return this.#api
    const [{ AgentApi }, { ModelApi }] = await Promise.all([
      import("./agent.ts"),
      import("./model.ts"),
    ])
    this.#api = {
      agent: new AgentApi(this),
      model: new ModelApi(this),
    }
    return this.#api
  }
}

export function toLoader<T extends () => any>(value: T | Awaited<ReturnType<T>>): T {
  return typeof value === "function" ? value : ((() => value) as T)
}
