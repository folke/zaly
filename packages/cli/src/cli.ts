// oxlint-disable sort-keys

import type { Config, Settings } from "@zaly/config"
import type { Node, RenderCtx, Theme } from "@zaly/tui"
import type { CamelCase } from "scule"
import type { Flags } from "./flags.ts"

import { createCtx, createRender } from "@zaly/tui"
import { Logger } from "@zaly/tui/logger"
import { defaultTheme, loadTheme } from "@zaly/tui/themes"
import { defineCommand } from "citty"
import { resolveConfig } from "./flags.ts"

// `CliArgs` is derived from the citty arg defs above so handlers can
// read parsed flags type-safely without re-declaring the shape.
type Setup = Extract<ReturnType<typeof mainCommand>["setup"], (...args: any[]) => any>
type Args = Parameters<Setup>[0]["args"]
export type CliArgs = {
  [K in keyof Args as CamelCase<K & string>]: Args[K]
}

const REASONING_EFFORTS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const

/**
 * `Cli` carries parsed args + lazily-resolved config between citty's
 * `setup` hook and the lazy-loaded subcommand modules. Subcommands grab
 * `cli.config` when they run; bare invocation falls through to the TUI.
 */
export class Cli extends Logger {
  args!: CliArgs
  #flags?: Flags
  #config?: Promise<Config>
  #ctx?: RenderCtx
  #queue: Promise<unknown> = Promise.resolve()
  #theme?: Theme

  constructor() {
    super({
      styles: {
        log: { style: "text" },
      },
    })
    this.attach({
      append: (node) => {
        // Reassign so `exit()` (and the next append) can await the tail.
        // Discarding the chained promise — as `void this.#queue.then(...)`
        // did — leaves `#queue` as the original `Promise.resolve()`,
        // making `await this.#queue` a no-op and racing process.exit().
        this.#queue = this.#queue
          .then(() => this.#append(node))
          .catch((error) => process.stderr.write(`Logger error: ${error}\n`))
      },
    })
    // this.install()
  }

  async loadTheme() {
    const config = await this.config()
    this.#theme ??= await loadTheme({
      name: config.settings.theme,
      dirs: await config.resources.themes(),
    })
    this.#theme ??= defaultTheme
    return this.#theme
  }

  async #append(node: () => Node): Promise<void> {
    this.#ctx ??= await createCtx({ theme: await this.loadTheme() })
    const rows = await createRender(node, this.#ctx)
    process.stdout.write(`${rows.join("\n")}\n`)
  }

  get flags(): Flags {
    return (this.#flags ??= resolveConfig(this.args))
  }

  async config(): Promise<Config> {
    if (this.#config) return this.#config
    const { loadConfig } = await import("@zaly/config")
    return (this.#config = loadConfig({
      cwd: this.flags.cwd,
      resources: {
        plugins: this.flags.plugins,
        themes: this.flags.themes,
        prompts: this.flags.prompts,
        skills: this.flags.skills,
      },
      settings: {
        theme: this.flags.theme,
        reasoning: this.flags.reasoning,
        model: this.flags.model,
        tools: this.flags.tools,
      },
    }))
  }

  async exit(code = 0): Promise<never> {
    await this.#queue
    process.exit(code)
  }

  async printConfig(): Promise<void> {
    const config = await this.config()
    const settings: Settings = {
      ...config.settings,
      plugins: await config.resources.plugins(),
      themes: await config.resources.themes(),
      prompts: await config.resources.prompts(),
      skills: await config.resources.skills(),
      packs: await config.resources.packs(),
    }
    const { codeToAnsi } = await import("@zaly/tui/shiki")
    const json = JSON.stringify(settings, undefined, 2)
    const theme = await this.loadTheme()
    const str = await codeToAnsi(json, "json", theme.shiki)
    this.log(str.trim())
    await this.exit()
  }

  async listThemes(): Promise<void> {
    const { themeRegistry } = await import("@zaly/tui/themes")
    const md = ["# Available themes"]
    for (const name of themeRegistry.keys().toSorted()) {
      md.push(`- **${name}**`)
    }
    this.log(md.join("\n"))
    await this.exit()
  }
}

export function mainCommand(cli: Cli) {
  return defineCommand({
    meta: {
      name: "zaly",
      version: "0.0.0",
      description: "Conversational coding agent",
    },
    args: {
      model: {
        type: "string",
        alias: ["m"],
        description:
          "Model id (provider/model). When omitted: uses the resumed session's model, else the last model you used (saved in ~/.zaly/state.json), else a built-in fallback.",
      },
      "api-key": {
        type: "string",
        description: "Override API key for the selected provider",
      },
      new: {
        alias: ["n"],
        type: "boolean",
        description: "Start a new session instead of resuming the most recent one",
      },
      session: {
        type: "string",
        description: "Session id, file path, cwd or glob pattern to resume",
      },
      "no-skills": {
        type: "boolean",
        description: "Don't load any skills",
      },
      "no-plugins": {
        type: "boolean",
        description: "Don't load any plugins",
      },
      "no-themes": {
        type: "boolean",
        description: "Don't load any themes",
      },
      "no-prompts": {
        type: "boolean",
        description: "Don't load any prompts",
      },
      "no-packs": {
        type: "boolean",
        description: "Don't load any resource packs",
      },
      tools: {
        type: "string",
        description:
          "Tools to enable (comma-separated, or pass --tools repeatedly). Defaults to the standard tool list.",
      },
      reasoning: {
        type: "enum",
        alias: ["thinking"],
        options: [...REASONING_EFFORTS],
        description: "Reasoning / thinking effort level",
      },
      theme: {
        type: "string",
        description: "Theme name (bundled) or path to a theme file",
      },
      "list-themes": {
        type: "boolean",
        description: "List bundled themes and exit",
      },
      cwd: {
        type: "string",
        alias: ["C"],
        description: "Working directory",
      },
      yolo: {
        type: "boolean",
        alias: ["y"],
        description: "Use the yolo permissions preset (allow everything)",
      },
      "print-config": {
        type: "boolean",
        description: "Print the resolved config and exit",
      },
    },
    async setup({ args }) {
      cli.args = args as unknown as CliArgs
      if (cli.args.printConfig) await cli.printConfig()
      if (cli.args.listThemes) await cli.listThemes()
    },
    // Lazy subcommand loading — each module is only imported when its
    // command name appears on the cli. The factory pattern lets us hand
    // each subcommand the shared `cli` so it can read `cli.config`.
    subCommands: {
      models: () => import("./commands/models.ts").then((m) => m.modelsCommand(cli)),
      session: () => import("./commands/session.ts").then((m) => m.sessionCommand(cli)),
    },
    // Citty fires `run` AFTER a subcommand returns, so guard against the
    // TUI launching on top of `zaly models`, `zaly session list`, …
    // `args._.length > 0` means a non-flag positional was present, i.e.
    // a subcommand consumed the invocation.
    async run({ args }) {
      if (args._.length > 0) return
      const { run } = await import("./commands/tui.ts")
      await run(cli)
    },
  })
}
