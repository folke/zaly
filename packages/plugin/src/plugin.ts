import type { Logger } from "@zaly/shared/logger"
import type { PluginApi } from "./api/api.ts"
import type { PluginHost } from "./types.ts"

import { normPath, toError } from "@zaly/shared"

export type PluginLoadResult = { ok: true; plugin: Plugin } | { ok: false; error: Error }
export type { Plugin }

export function loadPlugin(path: string, host: PluginHost): Promise<PluginLoadResult> {
  return Plugin.load(path, host)
}

class Plugin {
  #cleanup: (() => void)[] = []
  #path: string
  #api!: PluginApi
  #ac = new AbortController()
  #host: PluginHost
  #logger: Logger

  protected constructor(path: string, host: PluginHost) {
    this.#path = normPath(path)
    this.#host = host
    this.#logger = host.logger.child({ name: `plugin:${this.path}`, plugin: this.path })
  }

  static async load(path: string, host: PluginHost): Promise<PluginLoadResult> {
    const plugin = new Plugin(path, host)
    const { getPluginLoader } = await import("./loader.ts")
    const { PluginApi } = await import("./api/api.ts")
    plugin.#api = new PluginApi(plugin)
    try {
      const loader = await getPluginLoader(plugin.path)
      await loader(plugin.api)
      return { ok: true, plugin }
    } catch (error) {
      plugin.dispose()
      return { error: toError(error), ok: false }
    }
  }

  assertLoaded() {
    if (!this.running) throw new Error(`Plugin ${this.#path} is not loaded`)
  }

  get running() {
    return !this.#ac.signal.aborted
  }

  get logger() {
    return this.#logger
  }

  get path() {
    return this.#path
  }

  get host() {
    this.assertLoaded()
    return this.#host
  }

  get signal() {
    return this.#ac.signal
  }

  get ctx() {
    return this.host.ctx
  }

  cleanup(fn: () => void): void {
    this.#cleanup.push(fn)
  }

  dispose(): void {
    if (!this.running) return
    // LIFO so within-plugin override chains unwind correctly
    while (this.#cleanup.length > 0) this.#cleanup.pop()!()
    this.#cleanup = []
    this.#ac.abort()
  }

  get api(): PluginApi {
    this.assertLoaded()
    return this.#api
  }
}

export function toLoader<T extends () => any>(value: T | Awaited<ReturnType<T>>): T {
  return typeof value === "function" ? value : ((() => value) as T)
}
