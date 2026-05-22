import type { Agent } from "@zaly/agent"
import type { Input, Renderer } from "@zaly/tui"
import type { Cli } from "../cli.ts"
import type { Context } from "../context.ts"
import type { AppState } from "../types.ts"
import type { NotifProps } from "../widgets/notify.ts"

import { box, createRef, createRenderer, createStore } from "@zaly/tui"
import { compactionMarker } from "../widgets/compaction.ts"
import { helpOverlay } from "../widgets/help.ts"
import { Notifier } from "../widgets/notify.ts"
import { appUi, autocompleteOverlay } from "../widgets/ui.ts"
import { registerAgentActions, registerUiActions } from "./actions.ts"
import { buildAgent, wireAgent } from "./agent.ts"
import { AttachmentBuffer } from "./attachments.ts"
import { replay } from "./replay.ts"
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
  #ctx: Context
  #renderer!: Renderer
  #input!: Input

  #agent?: Agent
  #agentLifetime?: AbortController
  #exitPromise!: ReturnType<typeof Promise.withResolvers>
  #notifier!: Notifier

  #state = createStore<AppState>({
    busy: true,
    status: "loading",
    usage: { input: 0, output: 0 },
  })

  readonly #attachments = new AttachmentBuffer()

  private constructor(ctx: Context) {
    this.#ctx = ctx
  }

  static async start(cli: Cli): Promise<App> {
    const app = new App(cli.ctx)
    await app.#initRenderer()
    app.#renderer.start()
    void app.#initSessionAndAgent().catch((error) => app.#handleInitError(error))
    app.#exitPromise = Promise.withResolvers()
    return app
  }

  async waitExit(): Promise<unknown> {
    return this.#exitPromise.promise
  }

  exit(code = 0): void {
    this.#renderer.stop()
    this.#agentLifetime?.abort()
    if (code === 0) this.#exitPromise.resolve()
    else this.#exitPromise.reject(new Error(`Exited with code ${code}`))
    // Defer exit to allow pending renders and agent cleanup to complete.
    setTimeout(() => process.exit(code), 100)
  }

  /** Phase A — synchronous UI. No agent, no session. */
  async #initRenderer(): Promise<void> {
    // oxlint-disable-next-line sort-keys
    this.#renderer = await createRenderer({
      // Steady-state footer = input bar (1 row + 1 spacer/border row).
      // Stream commits to scrollback at `terminal.rows - 2`, so scrollback
      // is contiguous with the visible region as long as autocomplete and
      // other transient widgets stay closed.
      fixedFooterHeight: 3,
      reporter: {
        wrap: (node) => box({ padding: [1, 0, 0, 0] }, node),
      },
      logger: this.#ctx.logger.child("renderer"),
      theme: await this.#ctx.theme(),
    })

    this.#notifier = new Notifier(this.#renderer.overlay)

    setTimeout(() => {
      this.#notifier.notify("Welcome to zaly! Use Ctrl-H for help.")
    }, 1000)

    await this.#ctx.flush()
    this.#ctx.logger.detach("cli")

    const help = this.#renderer.overlay.add(() => helpOverlay(this.#renderer))

    const composer = createRef<Input>()

    this.#renderer.overlay.add(() =>
      autocompleteOverlay({ actions: this.#renderer.actions, composer })
    )

    this.#renderer.ui.add(() =>
      appUi({ actions: this.#renderer.actions, composer, state: this.#state })
    )

    this.#input = composer()

    registerUiActions({
      app: this,
      composer: this.#input,
      renderer: this.#renderer,
      toggleHelp: () => help.toggle(),
    })

    // Submit gated on busy — typing is fine during Phase B, but Enter
    // waits for the agent to be ready.
    this.#input.on("submit", ({ value }, self) => {
      const trimmed = value.trim()
      if (trimmed === "" || !this.#agent) return
      if (!this.#agent.model) {
        this.#ctx.error("No active model. Please use `/model` to select a model and try again.")
        return
      }
      self.setState({ cursor: 0, value: "" })
      const refs = this.#attachments.consume(trimmed)
      submit(trimmed, refs, this.#agent, this.#renderer)
      void this.#agent.waitIdle()
    })

    this.#input.on("attach", ({ attachment: att }, self) => {
      if (!this.#agent?.model) return
      void this.#attachments.stage(att, self, this.#agent.model)
    })
  }

  notify(msg: string, opts?: NotifProps) {
    this.#notifier.notify(msg, opts)
  }

  #handleInitError(error: unknown): void {
    this.#ctx.logger.child("app").error(error)
    this.#state.busy = false
    this.#state.status = "error"
    this.#notifier.notify(error instanceof Error ? error.message : String(error), { level: "error" })
  }

  /** Phase B — load session first (cheap), paint replay, then build
   *  the agent (heavy). The user sees their conversation history
   *  before model resolution finishes. */
  async #initSessionAndAgent(): Promise<void> {
    const session = await this.#ctx.session()

    // Replay the tail of a resumed conversation. 50 messages ≈ several
    // recent exchanges; older history stays in the session and is sent
    // to the model on the next request, just not painted here.
    const tail = session.messages.slice(-50)

    await replay(tail, this.#renderer)
    this.#notifier.notify(`Resumed session with ${session.messages.length} messages.`)

    this.#agent = await buildAgent(this.#ctx)
    const updateModel = () => (this.#state.model = this.#agent?.model)
    this.#agent.ctx.on("model", updateModel)
    updateModel()

    this.#agentLifetime = new AbortController()
    const opts = { signal: this.#agentLifetime.signal }

    wireAgent(this.#agent, this.#state, opts)

    bindStream(this.#renderer, this.#agent, opts)

    registerAgentActions({
      agent: this.#agent,
      renderer: this.#renderer,
    })

    this.#agent.session.on(
      "compact",
      () => this.#renderer.stream.append(() => compactionMarker()),
      opts
    )

    // Hand control to the status signal — flip from "loading" to
    // whatever the agent's authoritative state is (almost always
    // "ready"). wireAgent's onStatus handler drives both #busy and
    // #status from here on.
    this.#state.busy = false
    this.#state.status = "ready"
  }
}
