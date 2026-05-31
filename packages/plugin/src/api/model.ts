import type { AuthLoader, AuthProvider, Model, ModelFilter, ModelSpec } from "@zaly/ai"
import type { Plugin } from "../plugin.ts"

import { toLoader } from "../plugin.ts"

export class ModelApi {
  #plugin: Plugin

  constructor(plugin: Plugin) {
    this.#plugin = plugin
  }

  get #ctx() {
    return this.#plugin.ctx
  }

  get current() {
    return this.#ctx.model
  }

  set current(m: Model | undefined) {
    this.#ctx.model = m
  }

  async load(model: string | ({ id: string } & Partial<ModelSpec>)): Promise<Model> {
    this.#plugin.assertLoaded()
    const { loadModel } = await import("@zaly/ai")
    return loadModel(model)
  }

  async list(opts?: ModelFilter): Promise<Record<string, ModelSpec>> {
    this.#plugin.assertLoaded()
    const { listModels } = await import("@zaly/ai")
    return listModels(opts)
  }

  async register(spec: ModelSpec | ModelSpec[]) {
    this.#plugin.assertLoaded()
    const { registerModel } = await import("@zaly/ai")
    this.#plugin.cleanup(registerModel(spec))
  }

  async registerAuthProvider(name: string, provider: AuthLoader | AuthProvider) {
    this.#plugin.assertLoaded()
    const { authRegistry } = await import("@zaly/ai")
    this.#plugin.cleanup(authRegistry.register(name, toLoader(provider)))
  }
}
