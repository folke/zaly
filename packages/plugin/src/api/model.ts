import type { AuthLoader, AuthProvider, Model, ModelFilter, ModelSpec, ModelOpts } from "@zaly/ai"
import type { Plugin } from "../plugin.ts"

import { BaseCollection } from "@zaly/shared/collection"
import { toLoader } from "../plugin.ts"

export class ModelApi extends BaseCollection<Model, ModelOpts> {
  #plugin: Plugin

  constructor(plugin: Plugin) {
    super({ active: undefined })
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

  async _load(model: ModelOpts): Promise<Model> {
    this.#plugin.assertLoaded()
    const { loadModel } = await import("@zaly/ai")
    return loadModel(model)
  }

  async list(opts?: ModelFilter): Promise<ModelSpec[]> {
    this.#plugin.assertLoaded()
    const { listModels } = await import("@zaly/ai")
    const ret = await listModels(opts)
    return Object.values(ret)
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
