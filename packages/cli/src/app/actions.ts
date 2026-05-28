import type { OAuthProvider, ReasoningEffort } from "@zaly/ai"
import type { ActionDef } from "@zaly/tui"
import type { Overlay } from "@zaly/tui/widgets/overlay"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { Text } from "@zaly/tui/widgets/text"
import type { App } from "./app.ts"

import { formatNumber, prettyPath } from "@zaly/shared"
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
    "agent.effort": {
      cmd: "effort",
      desc: "Change how much reasoning the model uses for future turns.",
      fn: async () => {
        const items: PickerItem<ReasoningEffort>[] = REASONING_EFFORTS.map((level) => ({
          label: level,
          value: level,
        }))
        const effort = await app.pick({
          active: items.findIndex((i) => i.value === app.agent.ctx.reasoning),
          items,
        })
        if (effort) app.agent.ctx.reasoning = effort.value
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
        const { listModels, loadModel } = await import("@zaly/ai")
        const filter = ctx.args?._.join(" ") ?? ""
        const models = await listModels({
          auth: ctx.args?.all ? undefined : true,
          filter: filter.length > 0 ? filter : undefined,
        })

        const items: PickerItem[] = []
        for (const [id, m] of Object.entries(models)) {
          items.push({
            hint: [
              formatNumber(m.limit.context),
              m.reasoning ? "reasoning" : undefined,
              ...m.modalities.input.filter((mod) => mod !== "text").toSorted(),
            ]
              .filter(Boolean)
              .join(", "),
            label: id,
            value: id,
          })
        }
        const ret = await app.pick({ items, sort: true })
        if (ret) app.agent.ctx.model = await loadModel(ret.value)
      },
    }),
    "app.cancel": {
      cmd: "cancel",
      desc: "Clear the composer, or press twice to exit zaly.",
      fn: (() => {
        let exit = false
        return () => {
          if (exit) app.exit()
          else {
            if (app.input.length > 0) return (app.input = "")
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
      fn: (() => {
        let o: Overlay<[Text]> | undefined
        return async () => {
          const { helpOverlay } = await import("../widgets/help.ts")
          o ??= app.renderer.overlay.add(() => helpOverlay({ actions: app.actions }))
          o.toggle()
        }
      })(),
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
        // FIXME: this doesn't use custom theme dirs
        const { themeRegistry, loadTheme } = await import("@zaly/tui/themes")
        const themes = themeRegistry.keys()

        const items: PickerItem[] = []
        for (const id of themes) {
          items.push({
            label: id,
            value: id,
          })
        }
        const ret = await app.pick({ items, sort: true })
        if (ret) app.renderer.theme = await loadTheme(ret.value)
      },
    },
    "global.quit": {
      cmd: "quit",
      desc: "Quit zaly.",
      keys: [],
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
