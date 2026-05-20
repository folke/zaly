import type { Session } from "@zaly/agent/session"
import type { Config } from "@zaly/config"
import type { Theme } from "@zaly/tui"
import type { LogApi, LogLevel } from "@zaly/tui/logger"
import type { CliArgs } from "./cli.ts"
import type { Console } from "./console.ts"
import type { Flags } from "./types.ts"

import { normPath } from "@zaly/shared"
import { LazyCache } from "@zaly/shared/cache"
import { LoggerBase } from "@zaly/tui/logger"

type Slots = { config: Config; theme: Theme; console: Console; session: Session }

export class Context extends LoggerBase {
  #flags?: Flags
  #logger?: LogApi
  #cache = new LazyCache<Slots>()
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
    return this.#cache.need("session", async () => {
      const { loadSession } = await import("./app/session.ts")
      return await loadSession(this.flags)
    })
  }

  #console() {
    return this.#cache.need("console", async () => {
      const { Console } = await import("./console.ts")
      const c = new Console(this)
      this.#flush.push(() => c.flush())
      return c
    })
  }

  async flush() {
    await this.#cache.wait()
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
    this.#cache.forget(key)
  }

  config(): Promise<Config> {
    return this.#cache.need("config", async () => {
      const { loadConfig } = await import("@zaly/config")
      // oxlint-disable-next-line unicorn/consistent-function-scoping
      const falsy = (v?: boolean) => (v === false ? v : undefined)
      return loadConfig({
        settings: {
          model: this.flags.model,
          reasoning: this.flags.reasoning,
          resources: {
            plugins: falsy(this.flags.plugins),
            prompts: falsy(this.flags.prompts),
            skills: falsy(this.flags.skills),
            themes: falsy(this.flags.themes),
          },
          theme: this.flags.theme,
          tools: this.flags.tools,
        },
      })
    })
  }

  theme() {
    return this.#cache.need("theme", async () => {
      const config = await this.config()
      const { loadTheme } = await import("@zaly/tui/themes")
      return await loadTheme({
        dirs: await config.resources.themes(),
        name: config.settings.theme,
      })
    })
  }
}
