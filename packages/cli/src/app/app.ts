import type { Agent, PermissionRequest, Suggestion } from "@zaly/agent"
import type { Plugin, PluginHost } from "@zaly/plugin"
import type { Action, ActionDef, ActionMap, Actions, Renderer } from "@zaly/tui"
import type { Input } from "@zaly/tui/widgets/input"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { Cli } from "../cli.ts"
import type { Context } from "../context.ts"
import type { AppState } from "../types.ts"
import type { Composer } from "./composer.ts"

import { createRef, createRenderer, createStore, memo } from "@zaly/tui"
import { Notifier } from "@zaly/tui/services/notifier"
import { Picker } from "@zaly/tui/services/picker"
import { box } from "@zaly/tui/widgets/box"
import { compactionMarker } from "../widgets/compaction.ts"
import { appUi, autocompleteOverlay } from "../widgets/ui.ts"
import { appActions } from "./actions.ts"
import { loadAgent, loadAgentModel, wireAgent } from "./agent.ts"
import { createComposer } from "./composer.ts"
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
  #composer!: Composer

  #state = createStore<AppState>({
    busy: true,
    status: "loading",
    usage: { input: 0, output: 0 },
  })

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
    const keymap: Record<string, ActionDef> = {}
    for (const [id, pattern] of Object.entries(config.settings.keymap ?? {})) {
      const keys = typeof pattern === "string" ? [pattern] : pattern
      keymap[id] = { keys }
    }
    this.#renderer.actions.register(keymap, { default: false })

    this.#notifier = new Notifier(this.#renderer.overlay)

    await this.#ctx.flush()
    this.#ctx.logger.detach("cli")

    this.#composer = createComposer(this)
    this.#renderer.ui.add(() => appUi({ app: this, composer: this.#composer }))

    this.#input = this.#composer.input
    this.#picker = new Picker(this.#renderer.overlay, this.#input)
    this.#renderer.overlay.add(() =>
      autocompleteOverlay({
        actions: this.#renderer.actions,
        composer: createRef(this.#input),
        enabled: memo(() => !this.#picker.isOpen()),
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
    const tail = session.messages.filter((m) => !m.hidden).slice(-100)

    this.#notifier.notify(`Resumed session with ${session.messages.length} messages.`)
    await Promise.all([
      (async () => {
        await this.initAgent()
        await this.loadPlugins()
        this.agent.ctx.model ??= await loadAgentModel(this)
      })(),
      replay(tail, this),
    ])

    // Hand control to the status signal — flip from "loading" to
    // whatever the agent's authoritative state is (almost always
    // "ready"). wireAgent's onStatus handler drives both #busy and
    // #status from here on.
    this.#state.busy = false
    this.#state.status = "ready"
  }

  async initAgent(): Promise<void> {
    this.#agent = await loadAgent(this)
    this.#state.reasoning = this.#agent.ctx.reasoning
    this.#state.model = this.#agent.model
    this.#agent.ctx.on("model", () => (this.#state.model = this.#agent?.model))
    this.#agent.ctx.on("reasoning", () => (this.#state.reasoning = this.#agent?.ctx.reasoning))
    this.#agent.ctx.on("skills", ({ skills }) => {
      const actions: ActionMap = {}
      for (const skill of skills.catalog.values()) {
        actions[`skill.${skill.name}`] = {
          cmd: `skill:${skill.name}`,
          desc: skill.description,
          fn: async () => {
            const toolUse = await skills.activate(skill.name, this.agent)
            if (!toolUse)
              this.notify(`Skill \`${skill.name}\` already activated.`, { level: "warn" })
            else {
              this.agent.send(toolUse.messages)
              this.notify(`Activated skill \`${skill.name}\`...`, { level: "success" })
            }
          },
          source: "skills",
        }
      }
      this.#renderer.actions.register(actions, { default: false })
    })
    void this.#agent.ctx.skills()

    this.#agentLifetime = new AbortController()
    const opts = { signal: this.#agentLifetime.signal }

    wireAgent(this.#agent, this.#state, opts)

    bindStream(this)

    this.#agent.session.on(
      "compact",
      () => this.#renderer.stream.append(() => compactionMarker()),
      opts
    )
    void this.loadCommands()
  }

  async loadCommands(): Promise<void> {
    const config = await this.#ctx.config()
    const paths = await config.resources.commands()
    const actions = this.#renderer.actions

    const { Commands } = await import("@zaly/agent")
    const commands = new Commands({
      logger: this.#ctx.logger.child("commands"),
      paths,
    })

    // Unregister existing commands before loading new ones
    const existing = actions
      .list()
      .filter((a) => a.source === "commands")
      .map((a) => a.id)
    actions.unregister(...existing)

    await commands.load()

    const ret: Action[] = []
    for (const cmd of commands.catalog.values()) {
      ret.push({
        args: cmd.args,
        cmd: `command:${cmd.name}`,
        desc: cmd.description,
        fn: async ({ args }) => {
          const text = await commands.format(args ?? "", cmd)
          console.log(text)
        },
        id: `command.${cmd.name}`,
        source: "commands",
      })
    }
    this.#renderer.actions.register(ret, { default: false })
  }

  async reload(): Promise<void> {
    const config = await this.#ctx.config()
    config.resources.refresh()
    await this.loadPlugins()
    await this.loadCommands()
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
      else
        this.notify(`Failed to load plugin **${result.plugin.name}**:\n${result.error.message}`, {
          level: "error",
          textColor: "inherit",
          title: `Plugin ${result.plugin.name}`,
        })
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
