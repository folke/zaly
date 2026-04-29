import type { Agent } from "@zaly/agent"
import type { Config } from "./config.ts"
import type { RenderHandle } from "./render/index.ts"

import { signal } from "@zaly/tui"
import { registerActions } from "./actions.ts"
import { buildAgent } from "./agent.ts"
import { buildRenderer } from "./render/index.ts"

/**
 * App = the long-lived glue between Agent and Renderer. Keeps state
 * minimal: signals for the UI footer, a single agent reference (which
 * can be swapped on /reset), and a render handle that gets disposed
 * with it.
 */
export class App {
  readonly #config: Config
  #agent!: Agent
  #render!: RenderHandle

  readonly #busy = signal(false)
  readonly #status = signal("ready")
  readonly #model = signal("")

  constructor(config: Config) {
    this.#config = config
  }

  static async start(config: Config): Promise<App> {
    const app = new App(config)
    await app.#boot()
    app.#render.renderer.start()
    return app
  }

  async #boot(): Promise<void> {
    this.#agent = await buildAgent(this.#config)
    this.#model[1](this.#agent.model.id)

    this.#render = buildRenderer(this.#agent, {
      busy: this.#busy[0],
      model: this.#model[0],
      status: this.#status[0],
    })

    registerActions({
      agent: this.#agent,
      renderer: this.#render.renderer,
      reset: () => this.#reset(),
      toggleHelp: this.#render.toggleHelp,
    })

    this.#agent.on("stop", ({ reason }) => {
      this.#busy[1](false)
      this.#status[1](reason === "error" ? "error" : "ready")
      if (reason === "error" && this.#agent.lastError) {
        const err = this.#agent.lastError
        console.error(`${err.name}: ${err.message}`)
        if (err.stack) console.error(err.stack)
      }
    })

    this.#render.input.on("submit", ({ value }, self) => {
      const trimmed = value.trim()
      if (trimmed === "" || this.#busy[0]()) return
      self.setState({ cursor: 0, value: "" })
      void this.#submit(trimmed)
    })
  }

  async #submit(content: string): Promise<void> {
    this.#render.stream.pushUser(content)
    this.#busy[1](true)
    this.#status[1]("thinking")
    this.#agent.inject({ content, role: "user" })
    await this.#agent.waitIdle()
  }

  async #reset(): Promise<void> {
    this.#render.stream.dispose()
    await this.#agent.dispose()
    this.#agent = await buildAgent(this.#config)
    this.#model[1](this.#agent.model.id)
    // Re-bind stream + actions to the new agent. Renderer/UI stays.
    // Quick + dirty: rebuild everything except the renderer itself.
    // (Future: Renderer should expose `clear()` so we don't accumulate
    // history nodes across resets.)
  }
}
