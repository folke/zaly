import type { Model, ModelFilter, ModelOpts, ModelReg, ModelSpec } from "@zaly/ai"
import type { Collection } from "@zaly/shared/collection"
import type { Plugin } from "../plugin.ts"

export class ModelApi implements Collection<Model | undefined, Promise<ModelSpec[]>, ModelSpec> {
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

  register(spec: ModelReg | ModelReg[]) {
    this.#plugin.cleanup(this.#model.register(spec))
  }
}
