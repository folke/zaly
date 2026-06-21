import type { Agent } from "@zaly/agent"
import type { Config } from "@zaly/config"
import type { Plugin } from "@zaly/plugin"
import type { ActionDef, Actions, Node, Renderer } from "@zaly/tui"
import type { Input } from "@zaly/tui/widgets/input"
import type { Cli } from "../cli.ts"
import type { Context } from "../context.ts"
import type { AppState } from "../types.ts"
import type { Composer } from "./composer.ts"

import { createRef, createRenderer, createStore, effect, memo } from "@zaly/tui"
import { Notifier } from "@zaly/tui/services/notifier"
import { Picker } from "@zaly/tui/services/picker"
import { appUi, autocompleteOverlay } from "../widgets/ui.ts"
import { attachState, bootstrapModel, loadAgent } from "./agent.ts"

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
  plugins: Plugin[] = []

  #agent?: Agent
  #exitPromise!: ReturnType<typeof Promise.withResolvers>
  #notifier!: Notifier
  #picker!: Picker
  #composer!: Composer
  #loading = true
  // Logs added during the loading phase are sticky until the agent is ready,
  // so that the user can see them (will be at the bottom of the stream)
  #stickyLogs: Node[] = []

  #state = createStore<AppState>({
    busy: true,
    scroll: { below: 0, offset: 0, total: 0 },
    status: "loading",
    step: 0,
  })

  private constructor(ctx: Context) {
    this.#ctx = ctx
  }

  notify: Notifier["notify"] = (msg, opts) => this.#notifier.notify(msg, opts)
  pick: Picker["pick"] = (options) => this.#picker.pick(options)

  get config(): Config {
    return this.#ctx.config
  }

  get settings() {
    return this.#ctx.config.settings
  }

  get renderer(): Renderer {
    return this.#renderer
  }

  get picker(): Picker {
    return this.#picker
  }

  get agent(): Agent {
    if (!this.#agent) throw new Error("Agent not initialized")
    return this.#agent
  }

  get state(): AppState {
    return this.#state
  }

  get composer(): Composer {
    return this.#composer
  }

  get input() {
    return this.composer.value
  }

  set input(value: string) {
    this.composer.value = value
  }

  get actions(): Actions {
    return this.#renderer.actions
  }

  get ctx(): Context {
    return this.#ctx
  }

  /** True if bootstrapping is complete and the app is interactive. */
  get ready(): boolean {
    return !this.#loading && this.#agent !== undefined
  }

  static async start(cli: Cli): Promise<App> {
    const app = new App(cli.ctx)
    await app.#initRenderer()
    void app.#initSessionAndAgent().catch((error) => app.#handleInitError(error))
    app.#exitPromise = Promise.withResolvers()
    return app
  }

  async waitExit(): Promise<unknown> {
    return this.#exitPromise.promise
  }

  exit(code = 0): void {
    this.#renderer.stop()
    if (code === 0) this.#exitPromise.resolve()
    else this.#exitPromise.reject(new Error(`Exited with code ${code}`))
    // Defer exit to allow pending renders and agent cleanup to complete.
    setTimeout(() => process.exit(code), 100)
  }

  /** Phase A — synchronous UI. No agent, no session. */
  async #initRenderer(): Promise<void> {
    const [{ box }, { createComposer }] = await Promise.all([
      import("@zaly/tui/widgets/box"),
      import("./composer.ts"),
    ])
    this.#renderer = await createRenderer({
      fixedFooterHeight: 5,
      logger: this.#ctx.logger.child("renderer"),
      reporter: {
        wrap: (node) => {
          const n = box({ padding: [1, 0, 0, 0], sticky: this.#loading }, node)
          if (this.#loading) this.#stickyLogs.push(n)
          return n
        },
      },
      theme: await this.#ctx.theme(),
    })
    this.#renderer.stream.on("scroll", ({ offset, total, below }) => {
      this.#state.scroll = { below, offset, total }
    })

    void this.initActions()

    this.#notifier = new Notifier(this.#renderer.overlay)

    await this.#ctx.flush()
    this.#ctx.logger.detach("cli")

    this.#composer = createComposer(this)
    this.#renderer.ui.add(() => appUi({ app: this, composer: this.#composer }))

    this.#input = this.#composer.input
    this.#picker = new Picker(this.#renderer.overlay, this.#input, {
      maxHeight: this.settings.ui?.listHeight,
    })
    this.#renderer.overlay.add(() =>
      autocompleteOverlay({
        actions: this.#renderer.actions,
        app: this,
        composer: createRef(this.#input),
        enabled: memo(() => !this.#picker.isOpen()),
      })
    )
    effect(() => {
      if (this.#state.status === "error") this.#renderer.terminal.setProgress("error")
      else if (this.#state.busy) this.#renderer.terminal.setProgress("loading")
      else this.#renderer.terminal.setProgress()
    })

    this.#renderer.start()
    await this.#renderer.render()
  }

  async initActions(): Promise<void> {
    const { appActions } = await import("./actions.ts")
    this.#renderer.actions.register(appActions({ app: this }), { default: false })

    const keymap: Record<string, ActionDef> = {}
    for (const [id, pattern] of Object.entries(this.#ctx.config.settings.keymap ?? {})) {
      const keys = typeof pattern === "string" ? [pattern] : pattern
      keymap[id] = { keys }
    }
    this.#renderer.actions.register(keymap, { default: false })
  }

  #handleInitError(error: unknown): void {
    this.#ctx.logger.child("app").error(error)
    this.#state.busy = false
    this.#state.status = "error"
    this.#notifier.notify(error instanceof Error ? error.message : String(error), {
      level: "error",
    })
  }

  /** Phase B — load session first (cheap), paint replay, then build
   *  the agent (heavy). The user sees their conversation history
   *  before model resolution finishes. */
  async #initSessionAndAgent(): Promise<void> {
    await Promise.all([
      this.initAgent(),
      import("./replay.ts").then(async ({ replay }) => replay(await this.ctx.session(), this)),
    ])
    // Hand control to the status signal
    this.#loading = false
    this.#state.busy = false
    this.#state.status = "ready"
    for (const node of this.#stickyLogs) node.state.sticky = false
    this.#stickyLogs = []
  }

  async initAgent(): Promise<void> {
    this.#agent = await loadAgent(this)
    attachState(this.#agent, this.#state)

    await this.loadResources()
    await bootstrapModel(this.#agent, this, { notify: true })

    void import("./stream.ts").then(({ attachStream }) => attachStream(this))
  }

  async reload(): Promise<void> {
    await this.#ctx.loadConfig(true)
    this.#ctx.config.resources.refresh()
    await this.loadResources()
    this.#notifier.notify("Plugins & resources **reloaded**.")
  }

  async loadResources(): Promise<void> {
    const { packUpdates, packInstall } = await import("./plugins.ts")
    const installed = await packInstall(this)
    if (!installed) void packUpdates(this)

    await import("./plugins.ts").then(({ loadPlugins }) => loadPlugins(this))
    await Promise.all([
      import("./skills.ts").then(({ loadSkills }) => loadSkills(this)),
      import("./commands.ts").then(({ loadCommands }) => loadCommands(this)),
    ])
  }
}
