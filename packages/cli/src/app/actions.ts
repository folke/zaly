import type { OAuthProvider, ReasoningEffort } from "@zaly/ai"
import type { ActionDef, Theme } from "@zaly/tui"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { Option } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { formatNumber, prettyPath } from "@zaly/shared"
import { defineAction, untrack } from "@zaly/tui"
import { REASONING_EFFORTS } from "../context.ts"

export type AppAction = keyof ReturnType<typeof appActions>

/**
 * UI-only actions — registered in Phase A (no agent required).
 * Composer state, help overlay toggle, process exit. Each shows up in
 * the help overlay and in `/`-triggered autocomplete.
 */
export function appActions({ app }: { app: App }) {
  return {
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
      },
      cmd: "model",
      desc: "Switch the model used for future agent turns.",
      fn: async (ctx) => {
        const model = await app.ctx.model()
        const filter = ctx.args?._.join(" ") ?? ""
        const models = await model.list({
          auth: ctx.args?.all ? undefined : true,
          filter: filter.length > 0 ? filter : undefined,
        })

        const items: Option[] = []
        for (const m of models) {
          items.push({
            desc: [
              formatNumber(m.contextSize),
              m.reasoning ? "reasoning" : undefined,
              ...m.input.filter((mod) => mod !== "text").toSorted(),
            ]
              .filter(Boolean)
              .join(", "),
            name: (m.providerInfo?.name ? `[${m.providerInfo.name}] ` : "") + m.name,
            text: m.id,
          })
        }
        const ret = await app.pick({
          items,
          reverse: true,
          sort: ["score:desc", "idx"],
        })
        if (ret) model.active = await model.load(ret.text)
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
            if (app.input.length > 0) return (app.input = "")
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
      fn: () => (app.input = ""),
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
    "app.login": {
      cmd: "login",
      desc: "Authorize zaly with your ChatGPT account for Codex models.",
      fn: () => {
        void runCodexLogin().catch((error) => {
          app.ctx.error(
            `[login] failed: ${error instanceof Error ? error.message : String(error)}\n`
          )
        })
      },
    },
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
        const { themeRegistry, loadTheme } = await import("@zaly/tui/themes")
        const custom = await app.ctx.config.resources.themes()

        // All themes (including duplicates), sorted by highest to lowest precedence.
        const all = await Promise.all([...custom, ...themeRegistry.keys()].map(loadTheme))

        // Filter out duplicates, keeping the first (highest precedence) theme with a given ID.
        const seen = new Set<string>()
        const themes = all.filter((t) => {
          if (seen.has(t.id)) return false
          seen.add(t.id)
          return true
        })

        const items: (PickerItem & { id: string; theme: Theme })[] = themes
          .map((t) => ({
            id: t.id,
            // name: t.name ?? t.id,
            text: t.name ?? t.id,
            theme: t,
          }))
          .toSorted((a, b) => a.text.localeCompare(b.text))

        const current = untrack(() => app.renderer.theme)
        const ret = await app.pick({
          active: items.findIndex((i) => i.id === current.id),
          items,
          onOpen: (select) => {
            select.on("changed", async ({ item }) => {
              app.renderer.theme = item.theme
            })
          },
          reverse: true,
          sort: true,
        })
        app.renderer.theme = ret?.theme ?? current
        if (ret) await app.ctx.config.update({ ui: { theme: ret.id } })
      },
    },
    "composer.history": {
      cmd: "history",
      desc: "Browse and pick from recent composer inputs.",
      fn: () => void app.composer.pickHistory(),
      keys: ["ctrl-r"],
    },
    "global.quit": {
      cmd: "quit",
      desc: "Quit zaly.",
      keys: [],
    },
    "pack.update": {
      cmd: "update",
      desc: "Update all installed packs.",
      fn: async () => {
        const { pluginUpdate: packUpdate } = await import("./plugins.ts")
        await packUpdate(app)
      },
    },
    "pack.updates": {
      cmd: "updates",
      desc: "Check for updates of installed packs.",
      fn: async () => {
        const { pluginUpdates: packUpdates } = await import("./plugins.ts")
        await packUpdates(app, { notify: true })
      },
    },
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
        await sessionTree(app, { filter: app.$.ui.tree })
      },
    },
  } as const satisfies Record<string, ActionDef>
}

/** Drive the codex PKCE login flow with progress messages streamed to
 *  stdout. Browser is opened via the platform `open` / `xdg-open` /
 *  `start` helper; on bind failure the URL is printed for the user to
 *  copy manually. */
async function runCodexLogin(): Promise<void> {
  process.stdout.write("[login] starting OpenAI Codex (ChatGPT) authorization…\n")
  const { authRegistry } = await import("@zaly/ai")

  const codexAuth = (await authRegistry.load("codex")) as OAuthProvider

  const creds = await codexAuth.login({
    onAuthUrl: ({ url }) => {
      console.info(
        `**[login]** open this URL in your browser if it doesn't open automatically:\n  [${url}](${url})`
      )
      void openBrowser(url)
    },
    onProgress: (message) => {
      console.info(`**[login]** ${message}**`)
    },
  })
  console.info(`[login] linked ChatGPT account \`${creds.accountId}\`.`)
}

/** Best-effort cross-platform `xdg-open`/`open`/`start` shim. Failures
 *  are silent — the URL has already been printed for the user. */
async function openBrowser(url: string): Promise<void> {
  let cmd: string[]
  if (process.platform === "darwin") cmd = ["open", url]
  else if (process.platform === "win32") cmd = ["cmd", "/c", "start", "", url]
  else cmd = ["xdg-open", url]
  const { spawn } = await import("node:child_process")
  try {
    spawn(cmd[0], cmd.slice(1), { detached: true, stdio: "ignore" }).unref()
  } catch {
    // No `open` available — user can copy from the printed URL.
  }
}
