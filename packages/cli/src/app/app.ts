import type { Agent } from "@zaly/agent"
import type { Usage } from "@zaly/ai"
import type { LogCallable, Theme } from "@zaly/tui"
import type { Cli } from "../cli.ts"
import type { Config } from "../config.ts"

import { createRenderer, signal } from "@zaly/tui"
import { compactionMarker } from "../widgets/compaction.ts"
import { helpOverlay } from "../widgets/help.ts"
import { appUi } from "../widgets/ui.ts"
import { registerAgentActions, registerUiActions } from "./actions.ts"
import { buildAgent, wireAgent } from "./agent.ts"
import { AttachmentBuffer } from "./attachments.ts"
import { replay } from "./replay.ts"
import { loadSession } from "./session.ts"
import { bindStream } from "./stream.ts"
import { submit } from "./submit.ts"

/**
 * App = the long-lived glue between Agent and Renderer. Startup is
 * split into three phases so the UI paints before the agent loads:
 *
 *   A. sync           createRenderer → mount UI → first paint
 *   B. session+agent  loadSession → replay history; buildAgent → wire
 *
 * Phase A returns from `App.start` immediately. Phase B runs in the
 * background; the composer's `busy` signal gates submit until Phase B
 * completes, so typing during load is fine but Enter is a no-op.
 */
export class App {
  readonly #config: Config
  #theme!: Theme
  #renderer!: ReturnType<typeof createRenderer>
  #input!: ReturnType<typeof appUi>["input"]
  #log!: LogCallable

  #agent?: Agent
  #disposeAgentSignals?: () => void
  #disposeStream?: () => void

  readonly #busy = signal(true)
  readonly #status = signal("loading")
  readonly #model = signal("")
  readonly #usage = signal<Usage>({ input: 0, output: 0 })

  readonly #attachments = new AttachmentBuffer()

  private constructor(config: Config) {
    this.#config = config
  }

  static async start(cli: Cli): Promise<App> {
    const app = new App(cli.config)
    app.#theme = await cli.loadTheme()
    app.#initRenderer()
    app.#renderer.start()
    void app.#initSessionAndAgent()
    return app
  }

  /** Phase A — synchronous UI. No agent, no session. */
  #initRenderer(): void {
    this.#renderer = createRenderer({ theme: this.#theme })
    this.#renderer.logger.install()
    this.#log = this.#renderer.log

    const help = helpOverlay(this.#renderer)
    const ui = appUi(this.#renderer, {
      busy: this.#busy.get,
      model: this.#model.get,
      status: this.#status.get,
      usage: this.#usage.get,
    })
    this.#input = ui.input

    registerUiActions({ renderer: this.#renderer, toggleHelp: help.toggle })

    // Submit gated on busy — typing is fine during Phase B, but Enter
    // waits for the agent to be ready.
    this.#input.on("submit", ({ value }, self) => {
      const trimmed = value.trim()
      if (trimmed === "" || this.#busy.get() || !this.#agent) return
      self.setState({ cursor: 0, value: "" })
      const refs = this.#attachments.consume(trimmed)
      submit(trimmed, refs, this.#agent, this.#renderer)
      void this.#agent.waitIdle()
    })

    this.#input.on("attach", ({ attachment: att }, self) => {
      if (!this.#agent) return
      void this.#attachments.stage(att, self, this.#agent, this.#log)
    })
  }

  /** Phase B — load session first (cheap), paint replay, then build
   *  the agent (heavy). The user sees their conversation history
   *  before model resolution finishes. */
  async #initSessionAndAgent(): Promise<void> {
    const preloaded = await loadSession(this.#config)

    // Replay the tail of a resumed conversation. 50 messages ≈ several
    // recent exchanges; older history stays in the session and is sent
    // to the model on the next request, just not painted here.
    const tail = preloaded.session
      ? preloaded.session.messages.slice(-50)
      : preloaded.messages.slice(-50)
    for (const node of replay(tail)) this.#renderer.stream.append(node)

    this.#agent = await buildAgent(this.#config, preloaded)
    this.#model.set(`${this.#agent.model.id}:${this.#agent.model.provider.id}`)

    this.#disposeAgentSignals = wireAgent(this.#agent, {
      setBusy: this.#busy.set,
      setStatus: this.#status.set,
      setUsage: this.#usage.set,
    })

    this.#disposeStream = bindStream(this.#renderer, this.#agent)

    registerAgentActions({
      agent: this.#agent,
      renderer: this.#renderer,
      reset: () => this.#reset(),
    })

    this.#agent.session.on("compact", () => {
      this.#renderer.stream.append(compactionMarker())
    })

    // Hand control to the status signal — flip from "loading" to
    // whatever the agent's authoritative state is (almost always
    // "ready"). wireAgent's onStatus handler drives both #busy and
    // #status from here on.
    this.#busy.set(false)
    this.#status.set("ready")
  }

  async #reset(): Promise<void> {
    this.#disposeStream?.()
    this.#disposeAgentSignals?.()
    await this.#agent?.dispose()
    this.#agent = undefined

    const preloaded = await loadSession(this.#config)
    this.#agent = await buildAgent(this.#config, preloaded)
    this.#model.set(this.#agent.model.id)
    this.#disposeAgentSignals = wireAgent(this.#agent, {
      setBusy: this.#busy.set,
      setStatus: this.#status.set,
      setUsage: this.#usage.set,
    })
    this.#disposeStream = bindStream(this.#renderer, this.#agent)
  }
}
