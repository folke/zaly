import type { Session } from "@zaly/agent/session"
import type { Config } from "@zaly/config"
import type { LogLevel } from "@zaly/shared/logger"
import type { Theme } from "@zaly/tui"
import type { CliArgs } from "./cli.ts"
import type { CliReporter } from "./reporter.ts"
import type { Flags } from "./types.ts"

import { normPath } from "@zaly/shared"
import { LazyCache } from "@zaly/shared/cache"
import { BaseLogger, installLogger, Logger } from "@zaly/shared/logger"

type Slots = { config: Config; theme: Theme; console: CliReporter; session: Session }
export const REASONING_EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const

export class Context extends BaseLogger {
  #flags?: Flags
  #logger = new Logger({ name: "cli" }, { level: "info" })
  #cache = new LazyCache<Slots>()
  #flush: (() => Promise<void>)[] = []
  #dispose: (() => Promise<void> | void)[] = []

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
      const { loadSession } = await import("./app/session.ts")
      return await loadSession(this.flags)
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

  async stop(): Promise<void> {
    await this.flush()
    await Promise.all(this.#dispose.map((fn) => Promise.resolve(fn())))
  }
}
