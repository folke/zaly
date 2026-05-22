import type { Agent } from "@zaly/agent"
import type { OAuthProvider } from "@zaly/ai"
import type { Input, Renderer } from "@zaly/tui"
import type { App } from "./app.ts"

import { prettyPath } from "@zaly/shared"

/**
 * UI-only actions — registered in Phase A (no agent required).
 * Composer state, help overlay toggle, process exit. Each shows up in
 * the help overlay and in `/`-triggered autocomplete.
 */
export function registerUiActions(opts: {
  app: App
  renderer: Renderer
  composer: Input
  toggleHelp: () => void
}): void {
  const { app, renderer, composer, toggleHelp } = opts
  let cancel = false
  renderer.actions.register({
    "app.cancel": {
      desc: "cancel current input or exit on second press",
      fn: () => {
        if (cancel) app.exit()
        else {
          if ((composer.state.value ?? "").length > 0)
            return composer.state.set({ cursor: 0, value: "" })
          cancel = true
          app.notify("Press `Ctrl-C` again to exit.", {
            level: "warn",
            onClose: () => (cancel = false),
            timeout: 500,
          })
        }
      },
      hidden: true,
      keys: ["ctrl-c"],
      name: "cancel",
    },
    "app.clear": {
      desc: "clear the composer",
      fn: () => {
        composer.state.set({ cursor: 0, value: "" })
      },
      name: "clear",
    },
    "app.help": {
      desc: "toggle help overlay",
      fn: toggleHelp,
      keys: ["ctrl-h"],
      name: "help",
    },
    "app.login": {
      desc: "authorize zaly with your ChatGPT (codex) account",
      fn: () => {
        void runCodexLogin().catch((error) => {
          console.error(
            `[login] failed: ${error instanceof Error ? error.message : String(error)}\n`
          )
        })
      },
      name: "login",
    },
    "global.quit": { keys: [] },
  })
}

/**
 * Agent-dependent actions — registered in Phase B once `buildAgent`
 * resolves. Hot-add to the registry: the help overlay subscribes via
 * `actions.onChange` and re-renders as soon as these appear.
 */
export function registerAgentActions(opts: { renderer: Renderer; agent: Agent }): void {
  const { renderer, agent } = opts
  renderer.actions.register({
    "app.compact": {
      desc: "summarize older history to free context space",
      fn: () => {
        console.info("Compacting history...\n")
        void agent
          .compact()
          .catch((error) => console.error(`Compaction failed: ${error}\n`))
          .finally(() => console.info("Compaction complete.\n"))
      },
      name: "compact",
    },
    "app.pwd": {
      desc: "print the agent's current working directory",
      fn: () => {
        const cwd = prettyPath(agent.ctx.cwd, "~")
        console.info(`Current working directory: \`${cwd}\``)
      },
      name: "pwd",
    },
    "app.stop": {
      desc: "abort the current run",
      fn: () => agent.stop(),
      keys: ["esc"],
      name: "stop",
    },
  })
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
