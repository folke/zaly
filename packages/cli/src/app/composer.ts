// oxlint-disable no-await-in-loop
import type { Agent } from "@zaly/agent"
import type { Message } from "@zaly/ai"
import type { MaybePromise } from "@zaly/shared"
import type { Node } from "@zaly/tui"
import type { StyleBuilder } from "@zaly/tui/style"
import type { CompletionSource } from "@zaly/tui/widgets/autocomplete"
import type { Input, InputValue } from "@zaly/tui/widgets/input"
import type { App } from "./app.ts"

import { loadState, updateState } from "@zaly/config"
import { input } from "@zaly/tui/widgets/input"
import { ActionsComposer } from "./composer/actions.ts"
import { BashComposer } from "./composer/bash.ts"
import { FilesComposer } from "./composer/files.ts"
import { MessageComposer } from "./composer/message.ts"

export type FileRef = {
  ref: string
  path: string
  from?: number
  to?: number
}

export type ComposerCtx = {
  value: string
  app: App
  input: Input
  message?: Message<"user">
  stop: () => void
}

export type ComposerFormatCtx = ComposerCtx & {
  style: StyleBuilder
}

export type ComposerRenderCtx = Omit<ComposerCtx, "message"> & {
  message: Message<"user">
}

export type ComposerSubmitCtx = ComposerCtx &
  InputValue & {
    agent: Agent
  }

export type ComposerPlugin = {
  complete?: CompletionSource
  name: string
  when?: RegExp | ((value: string, ctx: ComposerCtx) => boolean)
  format?: (value: string, ctx: ComposerFormatCtx) => MaybePromise<string | undefined>
  validate?: (value: string, ctx: ComposerCtx) => true | string
  submit?: (value: string, ctx: ComposerSubmitCtx) => MaybePromise
  render?: (ctx: ComposerRenderCtx) => MaybePromise<Node | Node[] | undefined>
}

type PluginFeat = "format" | "validate" | "submit" | "render"

export class Composer {
  #app: App
  #plugins: ComposerPlugin[] = []
  #input?: Input

  constructor(app: App) {
    this.#app = app
  }

  ctx<T extends { value: string }>(ctx: T): ComposerCtx & T {
    return {
      app: this.#app,
      input: this.input,
      message: undefined,
      stop: () => true,
      ...ctx,
    }
  }

  get input(): Input {
    if (!this.#input) throw new Error("Composer input is not initialized yet.")
    return this.#input
  }

  get value(): string {
    return this.#input?.state.value ?? ""
  }

  set value(v: string) {
    if (!this.#input) throw new Error("Composer input is not initialized yet.")
    this.#input.state.value = v
  }

  add(plugin: ComposerPlugin): void {
    this.#plugins.push(plugin)
  }

  match<T extends PluginFeat>(
    feat: T,
    plugin: ComposerPlugin,
    ctx: ComposerCtx
  ): plugin is ComposerPlugin & Record<T, NonNullable<ComposerPlugin[T]>> {
    if (typeof plugin[feat] !== "function") return false
    if (plugin.when instanceof RegExp) {
      plugin.when.lastIndex = 0
      return plugin.when.test(ctx.value)
    }
    if (typeof plugin.when === "function") return plugin.when(ctx.value, ctx)
    return true
  }

  *plugins<T extends PluginFeat>(feat: T, ctx: ComposerCtx) {
    let stopped = false
    ctx.stop = () => (stopped = true)
    for (const p of this.#plugins) {
      if (this.match(feat, p, ctx)) yield p
      // oxlint-disable-next-line typescript/no-unnecessary-condition
      if (stopped) {
        yield false
        return
      }
    }
  }

  async format(
    value: string,
    opts: { style: StyleBuilder; message?: Message<"user"> }
  ): Promise<string> {
    const ctx = this.ctx({ value, ...opts })
    for (const plugin of this.plugins("format", ctx)) {
      if (plugin === false) break
      const formatted = await plugin.format(value, ctx)
      value = formatted ?? value
    }
    return value
  }

  validate(value: string): boolean {
    const ctx = this.ctx({ value })
    for (const plugin of this.plugins("validate", ctx)) {
      if (plugin === false) break
      const valid = plugin.validate(value, ctx)
      if (valid !== true) {
        this.#app.notify(valid, { level: "error" })
        return false
      }
    }
    return true
  }

  async render(
    value: string,
    opts: { style: StyleBuilder; message: Message<"user"> }
  ): Promise<Node[]> {
    const ctx = this.ctx({ value, ...opts })
    const nodes: Node[] = []
    for (const plugin of this.plugins("render", ctx)) {
      if (plugin === false) break
      const ret = await plugin.render(ctx)
      if (ret) nodes.push(...(Array.isArray(ret) ? ret : [ret]))
    }
    return nodes
  }

  async submit(value: InputValue): Promise<void> {
    if (value.value.trim() === "") return
    const ctx = this.ctx({ ...value, agent: this.#app.agent })
    for (const plugin of this.plugins("submit", ctx)) {
      if (plugin === false) return
      await plugin.submit(value.value, ctx)
    }
    this.#app.agent.send()
    void this.#app.agent.waitIdle()
  }

  get ui() {
    const ret = (this.#input = input({
      canAttach: (att) => {
        const model = this.#app.agent.model
        if (!model) return false
        if (att.type === "image" && model.canAttach("image")) return true
        if (att.type === "pdf" && model.canAttach("pdf")) return true
        return false
      },
      format: (value, ctx) => this.format(value, ctx),
      placeholder: "Ask zaly anything…",
      validate: (value: string) => this.validate(value),
    }).on("submit", (value) => this.submit(value))).on("history", ({ added }) =>
      updateState((s) => {
        const history = [...(s?.inputHistory ?? []), added]
        return { ...s, inputHistory: history.slice(-100) }
      })
    )

    void loadState().then((state) => {
      ret.history = [...(state.inputHistory ?? []), ...ret.history]
    })
    return this.#input
  }
}

export function createComposer(app: App): Composer {
  const composer = new Composer(app)
  composer.add(new ActionsComposer())
  composer.add(new MessageComposer())
  composer.add(new BashComposer())
  composer.add(new FilesComposer())
  return composer
}
