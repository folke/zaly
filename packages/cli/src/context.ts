import type { Session } from "@zaly/agent/session"
import type { Config } from "@zaly/config"
import type { Theme } from "@zaly/tui"
import type { LogApi, LogLevel } from "@zaly/tui/logger"
import type { CliArgs } from "./cli.ts"
import type { Console } from "./console.ts"
import type { Flags } from "./types.ts"

import { normPath } from "@zaly/shared"
import { LoggerBase } from "@zaly/tui/logger"

type Slots = { config: Config; theme: Theme; console: Console; session: Session }

export class Context extends LoggerBase {
  #flags?: Flags
  #logger?: LogApi
  #proms = new Map<string, Promise<unknown>>()
  #flush: (() => Promise<void>)[] = []

  constructor(public args: CliArgs) {
    super()
    this.install()
  }

  protected _log(level: LogLevel, ...msg: unknown[]): void {
    if (this.#logger) return this.#logger[level](...msg)
    void this.#console().then((c) => {
      this.#logger ??= c
      this.#logger[level](...msg)
    })
  }

  async session() {
    return this.#lazy("session", async () => {
      const { loadSession } = await import("./app/session.ts")
      return await loadSession(this.flags)
    })
  }

  #console() {
    return this.#lazy("console", async () => {
      const { Console } = await import("./console.ts")
      const c = new Console(this)
      this.#flush.push(() => c.flush())
      return c
    })
  }

  async flush() {
    await Promise.all(this.#proms.values())
    await Promise.all(this.#flush.map((fn) => fn()))
  }

  async setLogger(logger: LogApi): Promise<void> {
    await this.flush()
    this.#logger = logger
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
    this.#proms.delete(key)
  }

  #lazy<K extends keyof Slots>(key: K, fn: () => Promise<Slots[K]>): Promise<Slots[K]> {
    const ret = this.#proms.get(key)
    if (ret) return ret as Promise<Slots[K]>
    const prom = fn().catch((error) => {
      this.#proms.delete(key)
      throw error
    })
    this.#proms.set(key, prom)
    return prom
  }

  config(): Promise<Config> {
    return this.#lazy("config", async () => {
      const { loadConfig } = await import("@zaly/config")
      return loadConfig({
        cwd: this.flags.cwd,
        resources: {
          plugins: this.flags.plugins,
          prompts: this.flags.prompts,
          skills: this.flags.skills,
          themes: this.flags.themes,
        },
        settings: {
          model: this.flags.model,
          reasoning: this.flags.reasoning,
          theme: this.flags.theme,
          tools: this.flags.tools,
        },
      })
    })
  }

  theme() {
    return this.#lazy("theme", async () => {
      const config = await this.config()
      const { loadTheme } = await import("@zaly/tui/themes")
      return await loadTheme({
        dirs: await config.resources.themes(),
        name: config.settings.theme,
      })
    })
  }

  async exit(code = 0): Promise<never> {
    await this.flush()
    process.exit(code)
  }
}
