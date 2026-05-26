import type { Agent, PermissionRequest, Suggestion } from "@zaly/agent"
import type { Plugin, PluginHost } from "@zaly/plugin"
import type { ActionInfo, Actions, Input, PickerItem, Renderer } from "@zaly/tui"
import type { Cli } from "../cli.ts"
import type { Context } from "../context.ts"
import type { AppState } from "../types.ts"

import { box, createRef, createRenderer, createStore, Notifier, Picker, signal } from "@zaly/tui"
import { compactionMarker } from "../widgets/compaction.ts"
import { appUi, autocompleteOverlay } from "../widgets/ui.ts"
import { appActions } from "./actions.ts"
import { buildAgent, wireAgent } from "./agent.ts"
import { replay } from "./replay.ts"
import { bindStream } from "./stream.ts"

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
  #plugins: Plugin[] = []

  #agent?: Agent
  #agentLifetime?: AbortController
  #exitPromise!: ReturnType<typeof Promise.withResolvers>
  #notifier!: Notifier
  #picker!: Picker

  #state = createStore<AppState>({
    busy: true,
    status: "loading",
    usage: { input: 0, output: 0 },
  })

  #acEnabled = signal(true)

  private constructor(ctx: Context) {
    this.#ctx = ctx
  }

  notify: Notifier["notify"] = (msg, opts) => this.#notifier.notify(msg, opts)
  pick: Picker["pick"] = (options) => this.#picker.pick(options)

  get renderer(): Renderer {
    return this.#renderer
  }

  get agent(): Agent {
    if (!this.#agent) throw new Error("Agent not initialized")
    return this.#agent
  }

  get state(): AppState {
    return this.#state
  }

  get composer(): Input {
    return this.#input
  }

  get input() {
    return this.composer.state.value ?? ""
  }

  set input(value: string) {
    this.composer.state.value = value
  }

  get actions(): Actions {
    return this.#renderer.actions
  }

  get ctx(): Context {
    return this.#ctx
  }

  /** Whether the agent has finished loading and the app is ready to accept user input. */
  get ready(): boolean {
    return this.#agent !== undefined
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
      fixedFooterHeight: 5,
      reporter: {
        wrap: (node) => box({ padding: [1, 0, 0, 0] }, node),
      },
      logger: this.#ctx.logger.child("renderer"),
      theme: await this.#ctx.theme(),
    })
    this.#renderer.actions.register(appActions({ app: this }), { default: false })

    const config = await this.#ctx.config()
    const keymap: Record<string, ActionInfo> = {}
    for (const [id, pattern] of Object.entries(config.settings.keymap ?? {})) {
      const keys = typeof pattern === "string" ? [pattern] : pattern
      keymap[id] = { keys }
    }
    this.#renderer.actions.register(keymap, { default: false })

    this.#notifier = new Notifier(this.#renderer.overlay)

    setTimeout(() => {
      this.#notifier.notify("Welcome to zaly! Use Ctrl-H for help.")
    }, 1000)

    await this.#ctx.flush()
    this.#ctx.logger.detach("cli")

    const composer = createRef<Input>()
    this.#renderer.ui.add(() => appUi({ app: this, composer }))
    this.#input = composer()
    this.#picker = new Picker(this.#renderer.overlay, this.#input)
    this.#renderer.overlay.add(() =>
      autocompleteOverlay({
        actions: this.#renderer.actions,
        composer,
        enabled: this.#acEnabled.get,
      })
    )
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
    const session = await this.#ctx.session()

    // Replay the tail of a resumed conversation. 50 messages ≈ several
    // recent exchanges; older history stays in the session and is sent
    // to the model on the next request, just not painted here.
    const tail = session.messages.filter((m) => !m.hidden).slice(-50)

    await replay(tail, this.#renderer)
    this.#notifier.notify(`Resumed session with ${session.messages.length} messages.`)

    this.#agent = await buildAgent(this)
    this.#state.model = this.#agent.model
    this.#state.reasoning = this.#agent.ctx.reasoning
    this.#agent.ctx.on("model", () => (this.#state.model = this.#agent?.model))
    this.#agent.ctx.on("reasoning", () => (this.#state.reasoning = this.#agent?.ctx.reasoning))

    this.#agentLifetime = new AbortController()
    const opts = { signal: this.#agentLifetime.signal }

    wireAgent(this.#agent, this.#state, opts)

    bindStream(this.#renderer, this.#agent, opts)

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

    void this.loadPlugins()
  }

  async reload(): Promise<void> {
    const config = await this.#ctx.config()
    config.resources.refresh()
    await this.loadPlugins()
    this.#notifier.notify("Plugins & resources **reloaded**.")
  }

  async loadPlugins(): Promise<void> {
    if (!this.#agent) throw new Error("Agent not initialized")
    const config = await this.#ctx.config()
    for (const plugin of this.#plugins) {
      try {
        plugin.dispose()
      } catch (error) {
        this.#ctx.logger
          .child("plugins")
          .error(`Failed to dispose plugin \`${plugin.path}\`:`, error)
      }
    }
    this.#plugins = []
    const paths = await config.resources.plugins()
    const { loadPlugin } = await import("@zaly/plugin")

    const host: PluginHost = {
      ctx: this.#agent.ctx,
      loadTheme: (name: string) => this.#ctx.loadTheme(name),
      log: this.#ctx,
      logger: this.#ctx.logger.child("plugin"),
      notify: this.notify,
      pick: this.pick,
      renderer: this.#renderer,
    }

    const results = await Promise.all(paths.map((path) => loadPlugin(path, host)))
    for (const result of results) {
      if (result.ok) this.#plugins.push(result.plugin)
      else this.#ctx.logger.child("plugins").error(`Failed to load plugin:`, result.error)
    }
  }

  async allow(req: PermissionRequest): Promise<boolean> {
    const items: PickerItem<boolean | Suggestion>[] = []
    items.push({ label: "Allow", value: true })
    items.push({ label: "Deny", value: false })
    for (const s of req.suggestions ?? []) {
      if (s.kind === "rule") {
        items.push({
          hint: s.description,
          label: `Allow \`${s.scope}(${s.pattern})\``,
          value: { kind: "rule", pattern: s.pattern, scope: s.scope },
        })
      } else {
        items.push({
          hint: s.description,
          label: `Add workspace ${s.path}`,
          value: { kind: "workspace", path: s.path },
        })
      }
    }
    const ret = await this.pick<(typeof items)[number]>({ items, title: req.ask })
    if (ret === undefined || ret.value === false) return false
    if (ret.value !== true) {
      const perms = await this.agent.ctx.permissions()
      const s = ret.value
      if (s.kind === "rule") perms.addRule({ ...s, policy: "allow" })
      else perms.addWorkspace(s.path)
    }
    return true
  }
}
