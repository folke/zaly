// oxlint-disable sort-keys

import type { PermissionPresetName } from "@zaly/agent"
import type { Config } from "@zaly/config"
import type { CmdArgs } from "./types.ts"

import { defineCommand } from "citty"
import { Context, REASONING_EFFORTS } from "./context.ts"

export type CliArgs = CmdArgs<typeof mainCommand>

/**
 * `Cli` carries parsed args + lazily-resolved config between citty's
 * `setup` hook and the lazy-loaded subcommand modules. Subcommands grab
 * `cli.config` when they run; bare invocation falls through to the TUI.
 */
export class Cli {
  #args?: CliArgs
  #ctx?: Context
  #errors = new Set<unknown>()

  set args(args: CliArgs) {
    this.#args = args
  }

  get args(): CliArgs {
    if (!this.#args) throw new Error("CLI args not set")
    return this.#args
  }

  get ctx(): Context {
    this.#ctx ??= new Context(this.args)
    return this.#ctx
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      try {
        this.ctx.logger.error("Error:", error)
        this.#errors.add(error) // track errors that have been logged
      } catch {}
      throw error
    }
  }

  async stop(): Promise<void> {
    await this.ctx.stop()
    const e = console.error.bind(console)
    console.error = (...msg: unknown[]) => {
      if (this.#errors.has(msg[0])) return
      e(...msg)
    }
  }

  async printConfig(): Promise<void> {
    const config = await this.ctx.loadConfig()
    const settings: Config = {
      ...config.$,
      plugins: config.resources.list({ plugin: true }).map((p) => p.plugin.uri),
    }
    const resources = {
      plugins: await config.resources.plugins(),
      themes: await config.resources.themes(),
      commands: await config.resources.commands(),
      skills: await config.resources.skills(),
    }
    const [{ settingsReviverIssues }, { codeToAnsi }, { prettyPath }] = await Promise.all([
      import("@zaly/config"),
      import("@zaly/tui"),
      import("@zaly/shared"),
    ])
    const issues = settingsReviverIssues(settings)
    for (const issue of issues) {
      console.warn(`- **${issue.path}**: ${issue.msg}`)
    }
    const env = await this.ctx.dotenv()
    const penv = Object.fromEntries(Object.entries(env).map(([p, v]) => [prettyPath(p), v]))
    const json = JSON.stringify({ config: settings, env: penv, resources }, undefined, 2)
    const theme = await this.ctx.theme()
    const str = await codeToAnsi(json, "json", { theme: theme.shiki })
    this.ctx.log(str.trim())
  }

  async listThemes(): Promise<void> {
    const { themeRegistry } = await import("@zaly/tui/themes")
    const md = ["# Available themes"]
    for (const name of themeRegistry.keys().toSorted()) {
      md.push(`- **${name}**`)
    }
    this.ctx.log(md.join("\n"))
  }
}

export function mainCommand(cli: Cli) {
  return defineCommand({
    meta: {
      name: "zaly",
      version: typeof __VERSION__ === "string" ? __VERSION__ : "dev",
      description: "Conversational coding agent",
    },
    args: {
      debug: {
        type: "boolean",
        alias: ["d"],
        description: "Enable debug logging",
      },
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
      "no-commands": {
        type: "boolean",
        description: "Don't load any commands",
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
      permission: {
        type: "enum",
        options: ["strict", "readonly", "permissive", "yolo"] as PermissionPresetName[],
        description:
          "Permission preset to use (strict=deny all, readonly=allow read-only tools, permissive=allow most tools, yolo=allow everything). Overrides `yolo` flag if both are present.",
      },
      "print-config": {
        type: "boolean",
        description: "Print the resolved config and exit",
      },
    },
    setup: async ({ args }) => {
      cli.args = args as unknown as CliArgs
      await cli.run(() => cli.ctx.loadConfig())
    },
    // Lazy subcommand loading — each module is only imported when its
    // command name appears on the cli. The factory pattern lets us hand
    // each subcommand the shared `cli` so it can read `cli.config`.
    subCommands: {
      models: () => import("./commands/models.ts").then((m) => m.modelsCommand(cli)),
    },
    // Citty fires `run` AFTER a subcommand returns, so guard against the
    // TUI launching on top of `zaly models`, `zaly session list`, …
    // `args._.length > 0` means a non-flag positional was present, i.e.
    // a subcommand consumed the invocation.
    async run({ args }) {
      if (args._.length > 0) return
      if (cli.args.printConfig) return await cli.printConfig()
      if (cli.args.listThemes) return await cli.listThemes()
      const { run } = await import("./commands/tui.ts")
      await cli.run(() => run(cli))
    },
    async cleanup() {
      await cli.stop()
    },
  })
}
