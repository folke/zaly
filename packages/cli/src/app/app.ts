import type { Agent, PermissionRequest, Suggestion } from "@zaly/agent"
import type { ActionInfo, Actions, Input, Menu, PickerItem, Renderer } from "@zaly/tui"
import type { Cli } from "../cli.ts"
import type { Context } from "../context.ts"
import type { AppState } from "../types.ts"
import type { NotifProps } from "../widgets/notify.ts"
import type { PickOpts } from "../widgets/ui.ts"

import { box, createRef, createRenderer, createStore, signal } from "@zaly/tui"
import { compactionMarker } from "../widgets/compaction.ts"
import { Notifier } from "../widgets/notify.ts"
import { appUi, autocompleteOverlay, pickerOverlay } from "../widgets/ui.ts"
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

  #agent?: Agent
  #agentLifetime?: AbortController
  #exitPromise!: ReturnType<typeof Promise.withResolvers>
  #notifier!: Notifier

  #state = createStore<AppState>({
    busy: true,
    status: "loading",
    usage: { input: 0, output: 0 },
  })

  #acEnabled = signal(true)

  private constructor(ctx: Context) {
    this.#ctx = ctx
  }

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
    this.#renderer.overlay.add(() =>
      autocompleteOverlay({
        actions: this.#renderer.actions,
        composer,
        enabled: this.#acEnabled.get,
      })
    )
  }

  notify(msg: string, opts?: NotifProps) {
    this.#notifier.notify(msg, opts)
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
    const tail = session.messages.slice(-50)

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
  }

  async pick<T extends PickerItem<unknown> = PickerItem>(
    opts: Omit<PickOpts<T>, "input">
  ): Promise<T | undefined> {
    const res = Promise.withResolvers<T | undefined>()
    let settled = false
    this.#input.consume()
    const ref = createRef<Menu<T>>()
    const node = this.#renderer.overlay.open(() =>
      pickerOverlay({ ...opts, input: this.#input, ref })
    )
    this.#acEnabled.set(false)
    const menu = ref()
    const ac = new AbortController()

    const done = (value?: T) => {
      if (settled) return
      settled = true
      ac.abort()
      this.#acEnabled.set(true)
      this.#input.consume()
      res.resolve(value)
      this.#renderer.overlay.close(node)
    }

    node.once("unmount", () => done(), { signal: ac.signal })
    menu.once("cancel", () => done(), { signal: ac.signal })
    menu.once("select", ({ item }) => done(item), { signal: ac.signal })

    return res.promise
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
