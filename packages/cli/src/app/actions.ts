import type { OAuthProvider, ReasoningEffort } from "@zaly/ai"
import type { ActionInfo, Overlay, PickerItem, Text } from "@zaly/tui"
import type { App } from "./app.ts"

import { formatNumber, prettyPath } from "@zaly/shared"
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
      desc: "set the agent's reasoning effort level",
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
      name: "effort",
    },
    "agent.model": {
      desc: "select a model for the agent",
      fn: async () => {
        const { listModels, loadModel } = await import("@zaly/ai")
        const models = await listModels({ auth: true })

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
      name: "model",
    },
    "app.cancel": {
      desc: "cancel current input or exit on second press",
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
      name: "cancel",
    },
    "app.clear": {
      desc: "clear the composer",
      fn: () => (app.input = ""),
      name: "clear",
    },
    "app.compact": {
      desc: "summarize older history to free context space",
      fn: () => {
        app.ctx.info("Compacting history...\n")
        void app.agent
          .compact()
          .catch((error) => app.ctx.error(`Compaction failed: ${error}\n`))
          .finally(() => app.ctx.info("Compaction complete.\n"))
      },
      name: "compact",
    },
    "app.help": {
      desc: "toggle help overlay",
      fn: (() => {
        let o: Overlay<[Text]> | undefined
        return async () => {
          const { helpOverlay } = await import("../widgets/help.ts")
          o ??= app.renderer.overlay.add(() => helpOverlay({ actions: app.actions }))
          o.toggle()
        }
      })(),
      keys: ["ctrl-h"],
      name: "help",
    },
    "app.login": {
      desc: "authorize zaly with your ChatGPT (codex) account",
      fn: () => {
        void runCodexLogin().catch((error) => {
          app.ctx.error(
            `[login] failed: ${error instanceof Error ? error.message : String(error)}\n`
          )
        })
      },
      name: "login",
    },
    "app.pwd": {
      desc: "print the agent's current working directory",
      fn: () => {
        const cwd = prettyPath(app.agent.ctx.cwd, "~")
        app.ctx.info(`Current working directory: \`${cwd}\``)
      },
      name: "pwd",
    },
    "app.stop": {
      desc: "abort the current run",
      fn: () => app.agent.stop(),
      keys: ["esc"],
      name: "stop",
    },
    "app.theme": {
      desc: "choose a color theme",
      fn: async () => {
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
        if (ret) app.renderer.setTheme(await loadTheme(ret.value))
      },
      name: "theme",
    },
    "global.quit": { keys: [] },
  } as const satisfies Record<string, ActionInfo>
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
