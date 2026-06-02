import type { Plugin } from "../plugin.ts"

import { AgentApi } from "./agent.ts"
import { EventsApi } from "./events.ts"
import { ModelApi } from "./model.ts"
import { PromptsApi } from "./prompts.ts"
import { ToolsApi } from "./tools.ts"
import { UiApi } from "./ui.ts"

export class PluginApi {
  #plugin: Plugin
  #events?: EventsApi
  #agent?: AgentApi
  #model?: ModelApi
  #tools?: ToolsApi
  #prompts?: PromptsApi
  #ui?: UiApi

  constructor(plugin: Plugin) {
    this.#plugin = plugin
  }

  get events() {
    this.#plugin.assertLoaded()
    return (this.#events ??= new EventsApi(this.#plugin))
  }

  get prompts() {
    this.#plugin.assertLoaded()
    return (this.#prompts ??= new PromptsApi(this.#plugin))
  }

  get agent() {
    this.#plugin.assertLoaded()
    return (this.#agent ??= new AgentApi(this.#plugin))
  }

  get model() {
    this.#plugin.assertLoaded()
    return (this.#model ??= new ModelApi(this.#plugin))
  }

  get ui() {
    this.#plugin.assertLoaded()
    return (this.#ui ??= new UiApi(this.#plugin))
  }

  get tools() {
    this.#plugin.assertLoaded()
    return (this.#tools ??= new ToolsApi(this.#plugin))
  }

  get log() {
    this.#plugin.assertLoaded()
    return this.#plugin.logger
  }

  get signal() {
    return this.#plugin.signal
  }
}
