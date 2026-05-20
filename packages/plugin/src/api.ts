import type { Theme } from "@zaly/tui"
import type { ThemeLoader } from "@zaly/tui/themes"
import type { AgentApi } from "./agent.ts"

import { toLoader } from "./plugin.ts"

export class Api {
  #disposers: (() => void)[] = []
  //#events = new Emitter()

  agent: AgentApi

  constructor(opts: { agent: AgentApi }) {
    this.agent = opts.agent
  }

  async registerTheme(name: string, theme: Partial<Theme> | ThemeLoader) {
    const { themeRegistry } = await import("@zaly/tui/themes")
    this.#disposers.push(themeRegistry.register(name, toLoader(theme)))
  }

  dispose(): void {
    // LIFO so within-plugin override chains unwind correctly
    while (this.#disposers.length > 0) this.#disposers.pop()!()
  }
}
