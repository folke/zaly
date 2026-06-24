import type { PromptCollection, ToolCollection } from "@zaly/agent"
import type { Session } from "@zaly/agent/session"
import type { ModelCollection } from "@zaly/ai"
import type { ConfigManager } from "@zaly/config"
import type { PluginManager } from "@zaly/config/plugin"
import type { LogLevel } from "@zaly/shared/logger"
import type { Theme } from "@zaly/tui"
import type { CliArgs } from "./cli.ts"
import type { CliReporter } from "./reporter.ts"
import type { Flags } from "./types.ts"

import { normPath, safeReadFile } from "@zaly/shared"
import { LazyCache } from "@zaly/shared/cache"
import { BaseLogger, installLogger, Logger } from "@zaly/shared/logger"
import { zalyPaths } from "@zaly/shared/paths"
import { join } from "pathe"

type Slots = {
  theme: Theme
  console: CliReporter
  session: Session
  dotenv: Record<string, string[]>
  tools: ToolCollection
  model: ModelCollection
  prompts: PromptCollection
}
export const REASONING_EFFORTS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const

export class Context extends BaseLogger {
  #flags?: Flags
  #logger = new Logger({ name: "cli" }, { level: "info" })
  #cache = new LazyCache<Slots>()
  #flush: (() => Promise<void>)[] = []
  #dispose: (() => Promise<void> | void)[] = []
  #config?: ConfigManager

  constructor(public args: CliArgs) {
    super()
    this.#dispose.push(installLogger(this.#logger))
    this.#logger.attach("cli", (entry) => {
      void this.#reporter().then((c) => c.$log(entry))
    })
  }

  get logger(): Logger {
    return this.#logger
  }

  $log(level: LogLevel, ...msg: unknown[]): void {
    this.#logger[level](...msg)
  }

  async session() {
    return this.#cache.need("session", async () => {
      const { bootstrapSession } = await import("./app/session.ts")
      return await bootstrapSession(this.flags)
    })
  }

  #reporter() {
    return this.#cache.need("console", async () => {
      const { CliReporter } = await import("./reporter.ts")
      const c = new CliReporter(this)
      this.#flush.push(() => c.flush())
      return c
    })
  }

  async flush() {
    await this.#cache.wait()
    await Promise.all(this.#flush.map((fn) => fn()))
  }

  get flags(): Flags {
    if (this.#flags) return this.#flags
    const tools = this.args.tools
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    this.#flags = {
      ...this.args,
      cwd: this.args.cwd ? normPath(this.args.cwd) : undefined,
      tools: tools?.length ? tools : undefined,
    }
    return this.#flags
  }

  reset(key: keyof Slots): void {
    this.#cache.forget(key)
  }

  dotenv(): Promise<Record<string, string[]>> {
    return this.#cache.need("dotenv", async () => {
      const { parseEnv } = await import("node:util")
      const paths = [".env", join(zalyPaths.config, ".env")].map((p) => normPath(p))
      const ret: Record<string, string[]> = {}
      const envs = await Promise.all(
        paths.map(async (p) =>
          safeReadFile(p)
            .then((content) => (content ? { ...parseEnv(content) } : {}))
            .catch(() => ({}))
        )
      )
      for (let i = 0; i < paths.length; i++) {
        const env = envs[i]
        const entries = Object.entries(env)
        if (entries.length === 0) continue
        const path = paths[i]
        ret[path] = []
        for (const [key, value] of entries) {
          if (value === undefined || process.env[key] !== undefined) continue
          ret[path].push(key)
          process.env[key] ??= value
        }
      }
      return ret
    })
  }

  get config(): ConfigManager {
    if (this.#config) return this.#config
    throw new Error("config not loaded yet")
  }

  async loadConfig(reload = false): Promise<ConfigManager> {
    if (this.#config && !reload) return this.#config
    await this.dotenv()
    const { loadConfig } = await import("@zaly/config")
    return (this.#config = await loadConfig({
      settings: {
        model: this.flags.model,
        reasoning: this.flags.reasoning,
        resources: {
          exclude: (["commands", "plugins", "skills", "themes"] as const).filter(
            (t) => this.flags[t] === false
          ),
        },
        tools: this.flags.tools,
        ui: {
          theme: this.flags.theme,
        },
      },
    }))
  }

  theme() {
    return this.#cache.need("theme", async () => this.loadTheme())
  }

  tools() {
    return this.#cache.need("tools", async () => {
      const { toolCollection } = await import("@zaly/agent")
      return await toolCollection()
    })
  }

  model() {
    return this.#cache.need("model", async () => {
      const { modelCollection } = await import("@zaly/ai")
      return modelCollection()
    })
  }

  prompts() {
    return this.#cache.need("prompts", async () => {
      const { promptCollection } = await import("@zaly/agent")
      return promptCollection()
    })
  }

  async loadTheme(name?: string): Promise<Theme> {
    const { loadTheme } = await import("@zaly/tui/themes")
    const paths = await this.config.resources.themes()
    const path = paths.find((p) => p.endsWith(`${name}.json`))
    name ??= this.config.$.ui.theme
    return await loadTheme(path ?? name)
  }

  async stop(): Promise<void> {
    await this.flush()
    await Promise.all(this.#dispose.map((fn) => Promise.resolve(fn())))
  }

  async packs(): Promise<PluginManager> {
    const { PluginManager } = await import("@zaly/config/plugin")
    const plugins = this.config.resources.list({ plugin: true }).map((p) => p.plugin)
    return new PluginManager(plugins, {
      git: this.config.$.system.git,
      npm: this.config.$.system.npm,
    })
  }
}
