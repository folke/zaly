import type { AnyTool, ToolCollection } from "@zaly/agent"
import type { Tool, ToolDef } from "@zaly/ai"
import type { Collection } from "@zaly/shared/collection"
import type { Static, TObject, TSchema } from "typebox/type"
import type { Plugin } from "../plugin.ts"

import { defineTool } from "@zaly/ai"

export class ToolsApi implements Collection<AnyTool[], AnyTool[], ToolDef> {
  #plugin: Plugin

  constructor(plugin: Plugin) {
    this.#plugin = plugin
  }

  get #tools(): ToolCollection {
    return this.#plugin.host.tools
  }

  get active(): AnyTool[] {
    return this.#tools.active
  }

  set active(tools: AnyTool[]) {
    this.#tools.active = tools
  }

  async load(tools?: AnyTool[]): Promise<Tool[]> {
    return this.#tools.load(tools)
  }

  list(): AnyTool[] {
    return this.#tools.list()
  }

  register<Params extends TObject, Result extends TSchema = TSchema, Meta extends object = object>(
    def: ToolDef<Params, Result, Meta>
  ): Tool<Static<Params>, Static<Result>, Meta> {
    const ret = defineTool(def)
    this.#plugin.cleanup(this.#tools.register(ret))
    return ret
  }
}
