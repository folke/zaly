import type { Model, ModelFilter, ModelOpts, ModelProvider, ModelSpec } from "@zaly/ai"
import type { Collection } from "@zaly/shared/collection"
import type { Plugin } from "../plugin.ts"

export class ModelApi implements Collection<
  Model | undefined,
  Promise<ModelSpec[]>,
  ModelProvider
> {
  #plugin: Plugin

  constructor(plugin: Plugin) {
    this.#plugin = plugin
  }

  get #model() {
    return this.#plugin.host.model
  }

  get active(): Model | undefined {
    return this.#model.active
  }

  set active(model: Model | undefined) {
    this.#model.active = model
  }

  async list(opts?: ModelFilter): Promise<ModelSpec[]> {
    return this.#model.list(opts)
  }

  async load(opts: ModelOpts): Promise<Model> {
    return this.#model.load(opts)
  }

  register(provider: ModelProvider) {
    this.#plugin.cleanup(this.#model.register(provider))
  }
}
