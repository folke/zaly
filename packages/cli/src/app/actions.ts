import type { ReasoningEffort } from "@zaly/ai"
import type { ActionDef } from "@zaly/tui"
import type { Option } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { prettyPath } from "@zaly/shared"
import { defineAction } from "@zaly/tui"
import { REASONING_EFFORTS } from "../context.ts"

export type AppAction = keyof ReturnType<typeof appActions>

/**
 * UI-only actions — registered in Phase A (no agent required).
 * Composer state, help overlay toggle, process exit. Each shows up in
 * the help overlay and in `/`-triggered autocomplete.
 */
export function appActions({ app }: { app: App }) {
  return {
    "agent.context": {
      cmd: "context",
      desc: "Show a tree view of the current session's context.",
      fn: async () => {
        const { contextTree } = await import("./context.ts")
        await contextTree(app)
      },
    },
    "agent.effort": {
      cmd: "effort",
      desc: "Change how much reasoning the model uses for future turns.",
      fn: async () => {
        const items: (Option & { text: ReasoningEffort })[] = REASONING_EFFORTS.map((level) => ({
          name: level,
          text: level,
        }))
        const effort = await app.pick({
          active: items.findIndex((i) => i.text === app.agent.ctx.reasoning),
          items,
        })
        if (effort) app.agent.ctx.reasoning = effort.text
      },
    },
    "agent.model": defineAction({
      args: {
        all: {
          desc: "Show all models, including non-authenticated ones",
          short: "a",
          type: "boolean",
        },
        refresh: {
          desc: "Refresh the model list from the provider",
          short: "r",
          type: "boolean",
        },
      },
      cmd: "model",
      desc: "Switch the model used for future agent turns.",
      fn: async (ctx) => {
        const { pickModel } = await import("./model.ts")
        await pickModel(app, {
          all: ctx.args?.all,
          filter: ctx.args?._.join(" "),
          refresh: ctx.args?.refresh,
        })
      },
    }),
    "app.cancel": {
      cmd: "cancel",
      desc: "Clear the composer, close the picker, or press twice to exit zaly.",
      fn: (() => {
        let exit = false
        return () => {
          if (exit) app.exit()
          else {
            if (app.composer.value.length > 0) return (app.composer.value = "")
            if (app.prompt.isOpen()) return app.prompt.close()
            if (app.picker.isOpen()) return app.picker.close()
            exit = true
            app.notify("Press `Ctrl-C` again to exit.", {
              level: "warn",
              onClose: () => (exit = false),
              timeout: 500,
            })
          }
        }
      })(),
      hidden: true,
      keys: ["ctrl-c"],
    },
    "app.clear": {
      cmd: "clear",
      desc: "Clear the current composer input.",
      fn: () => (app.composer.value = ""),
    },
    "app.compact": {
      cmd: "compact",
      desc: "Summarize older history while preserving recent messages.",
      fn: () => {
        app.ctx.info("Compacting history...\n")
        void app.agent
          .compact()
          .catch((error) => app.ctx.error(`Compaction failed: ${error}\n`))
          .finally(() => app.ctx.info("Compaction complete.\n"))
      },
    },
    "app.help": {
      cmd: "help",
      desc: "Show or hide the keyboard shortcut help overlay.",
      fn: async () => {
        const { help } = await import("../widgets/help.ts")
        app.ctx.info(help(app.actions))
      },
      keys: ["ctrl-h"],
    },
    "app.login": defineAction({
      args: {
        model: {
          desc: "Authenticate with the current model provider",
          short: "m",
          type: "boolean",
        },
      },
      cmd: "login",
      desc: "Authenticate with a model provider",
      fn: async ({ args }) => {
        const { listProviders, login } = await import("./provider.ts")
        // oxlint-disable-next-line unicorn/prefer-ternary
        if (args?.model) await login(app)
        else await listProviders(app)
      },
    }),
    "app.pwd": {
      cmd: "pwd",
      desc: "Show the workspace directory the agent is running in.",
      fn: () => {
        const cwd = prettyPath(app.agent.ctx.cwd, "~")
        app.ctx.info(`Current working directory: \`${cwd}\``)
      },
    },
    "app.reload": {
      cmd: "reload",
      desc: "Reload plugins & resources",
      fn: () => void app.reload(),
    },
    "app.scroll-bottom": {
      cmd: "scroll-bottom",
      desc: "Scroll to the bottom of the message history.",
      fn: () => app.renderer.stream.scrollBottom(),
      keys: ["end", "ctrl-down"],
    },
    "app.scroll-down": {
      desc: "Scroll down in the message history.",
      fn: () => app.renderer.stream.scrollDown(),
      keys: ["pagedown", "ctrl-d"],
    },
    "app.scroll-top": {
      cmd: "scroll-top",
      desc: "Scroll to the top of the message history.",
      fn: () => app.renderer.stream.scrollTop(),
      keys: ["home", "ctrl-up"],
    },
    "app.scroll-up": {
      desc: "Scroll up in the message history.",
      fn: () => app.renderer.stream.scrollUp(),
      keys: ["pageup", "ctrl-u"],
    },
    "app.stop": {
      cmd: "stop",
      desc: "Stop the current agent turn or running tool batch.",
      fn: () => app.agent.stop(),
      keys: ["esc"],
    },
    "app.theme": {
      cmd: "theme",
      desc: "Choose a color theme for the current TUI session.",
      fn: async () => {
        const { pickTheme } = await import("./themes.ts")
        await pickTheme(app)
      },
    },
    "composer.history": {
      cmd: "history",
      desc: "Browse and pick from recent composer inputs.",
      fn: () => void app.composer.pickHistory(),
      keys: ["ctrl-r"],
    },
    "config.edit": defineAction({
      args: {
        project: {
          desc: "Edit the project config file",
          short: "p",
          type: "boolean",
        },
        user: {
          desc: "Edit the user config file.",
          short: "u",
          type: "boolean",
        },
      },
      cmd: "config",
      desc: "Edit the current workspace configuration.",
      fn: async ({ args }) => {
        const { editConfig } = await import("./config.ts")
        await editConfig(app, {
          // oxlint-disable-next-line no-nested-ternary
          scope: args?.project ? "project" : args?.user ? "user" : undefined,
        })
      },
    }),
    "global.quit": {
      cmd: "quit",
      desc: "Quit zaly.",
      keys: [],
    },
    "plugins.install": defineAction({
      args: {
        plugins: {
          desc: "The plugin URI(s) to install.",
          multiple: true,
          positional: true,
          type: "string",
        },
        project: {
          desc: "Install a plugin in the current project.",
          short: "p",
          type: "boolean",
        },
        user: {
          desc: "Install a plugin in the user config.",
          short: "u",
          type: "boolean",
        },
      },
      cmd: "install",
      desc: "Install one or more plugins",
      fn: async ({ args }) => {
        const { installPlugins } = await import("./plugins.ts")
        await installPlugins(app, {
          plugins: args?.plugins,
          // oxlint-disable-next-line no-nested-ternary
          scope: args?.project ? "project" : args?.user ? "user" : undefined,
        })
      },
    }),
    "plugins.manage": {
      cmd: "plugins",
      desc: "Manage installed plugins.",
      fn: async () => {
        const { managePlugins } = await import("./plugins.ts")
        await managePlugins(app)
      },
    },
    "plugins.update": {
      cmd: "update",
      desc: "Update all installed plugins.",
      fn: async () => {
        const { updatePlugins: pluginUpdate } = await import("./plugins.ts")
        await pluginUpdate(app)
      },
    },
    "resources.pick": defineAction({
      args: {
        plugin: {
          desc: "Configure plugin resources only.",
          type: "boolean",
        },
        project: {
          desc: "Configure project resources only.",
          short: "p",
          type: "boolean",
        },
        user: {
          desc: "Configure user resources only.",
          short: "u",
          type: "boolean",
        },
      },
      cmd: "resources",
      desc: "Pick which resources are enabled in the current workspace.",
      fn: async ({ args }) => {
        const { pickResources } = await import("./resources.ts")
        await pickResources(app, {
          plugin: args?.plugin ? true : undefined,
          // oxlint-disable-next-line no-nested-ternary
          scope: args?.project ? "project" : args?.user ? "user" : undefined,
        })
      },
    }),
    "session.new": {
      cmd: "new",
      desc: "Start a new session in the current workspace.",
      fn: async () => {
        const { newSession } = await import("./session.ts")
        await newSession(app)
      },
    },
    "session.resume": {
      cmd: "resume",
      desc: "Resume a session in the current workspace.",
      fn: async () => {
        const { pickSession } = await import("./session.ts")
        await pickSession(app)
      },
    },
    "session.tree": {
      cmd: "tree",
      desc: "Show a tree view of the current session's message history.",
      fn: async () => {
        const { sessionTree } = await import("./session.ts")
        await sessionTree(app, { filter: app.$.ui.sessionTree })
      },
    },
  } as const satisfies Record<string, ActionDef>
}
