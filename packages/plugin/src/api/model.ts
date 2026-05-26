import type { AuthLoader, AuthProvider, Model, ModelFilter, ModelSpec } from "@zaly/ai"
import type { Plugin } from "../plugin.ts"

import { toLoader } from "../plugin.ts"

export type ModelOpts = ModelSpec & { auth?: AuthProvider }

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

  async load(id: string, opts?: Partial<ModelOpts>): Promise<Model>
  async load(model: ModelOpts): Promise<Model>
  async load(source: string | ModelOpts, o?: Partial<ModelOpts>): Promise<Model> {
    this.#plugin.assertLoaded()
    const { loadModel } = await import("@zaly/ai")
    if (typeof source === "string") {
      const { auth, ...opts } = o ?? {}
      return loadModel(source, opts, auth)
    }
    const { auth, ...opts } = source
    return loadModel(opts, undefined, auth)
  }

  async list(opts?: ModelFilter): Promise<Record<string, ModelOpts>> {
    this.#plugin.assertLoaded()
    const { listModels } = await import("@zaly/ai")
    return listModels(opts)
  }

  async register(id: string, spec: ModelSpec) {
    this.#plugin.assertLoaded()
    const { registerModel } = await import("@zaly/ai")
    this.#plugin.cleanup(registerModel(id, spec))
  }

  async registerAuthProvider(name: string, provider: AuthLoader | AuthProvider) {
    this.#plugin.assertLoaded()
    const { authRegistry } = await import("@zaly/ai")
    this.#plugin.cleanup(authRegistry.register(name, toLoader(provider)))
  }
}
