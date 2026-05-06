import type { Agent } from "@zaly/agent"
import type { Renderer } from "@zaly/tui"

import { loginCodex } from "@zaly/ai"

export interface ActionContext {
  agent: Agent
  renderer: Renderer
  /** Toggles the help overlay; wired by render/overlay.ts. */
  toggleHelp: () => void
  /** Disposes the current agent and starts a fresh one. */
  reset: () => Promise<void>
}

/**
 * Register all slash-command actions. Each one shows up in the help
 * overlay, in `/`-triggered autocomplete, and is dispatchable from
 * keymaps via `renderer.actions.dispatch("app.<name>")`.
 */
export function registerActions(ctx: ActionContext): void {
  const { renderer } = ctx
  renderer.actions.register({
    "app.clear": {
      desc: "clear the composer",
      fn: () => {
        const node = renderer.getNode("composer") as
          | { setState: (p: { cursor: number; value: string }) => void }
          | undefined
        node?.setState({ cursor: 0, value: "" })
      },
      name: "clear",
    },
    "app.compact": {
      desc: "summarize older history to free context space",
      fn: () => {
        console.log("Compacting history...")
        void ctx.agent
          .compact()
          .catch((error) => console.error("Compaction failed:", error))
          .finally(() => console.log("Compaction complete."))
      },
      name: "compact",
    },
    "app.help": {
      desc: "toggle help overlay",
      fn: ctx.toggleHelp,
      keys: ["ctrl-h"],
      name: "help",
    },
    "app.login": {
      desc: "authorize zaly with your ChatGPT (codex) account",
      fn: () => {
        void runCodexLogin().catch((error) => {
          console.error("[login] failed:", error instanceof Error ? error.message : error)
        })
      },
      name: "login",
    },
    "app.quit": {
      desc: "exit zaly",
      fn: () => {
        renderer.stop()
        process.exit(0)
      },
      name: "quit",
    },
    "app.reset": {
      desc: "start a fresh session",
      fn: () => void ctx.reset(),
      name: "reset",
    },
    "app.stop": {
      desc: "abort the current run",
      fn: () => ctx.agent.abort(),
      keys: ["ctrl-x"],
      name: "stop",
    },
  })
}

/** Drive the codex PKCE login flow with progress messages streamed to
 *  stdout. The TUI surfaces them in the conversation area, same as
 *  `app.compact`. Browser is opened via the platform `open` /
 *  `xdg-open` / `start` helper; on bind failure the URL is printed for
 *  the user to copy manually. */
async function runCodexLogin(): Promise<void> {
  console.log("[login] starting OpenAI Codex (ChatGPT) authorization…")
  const creds = await loginCodex({
    onAuthUrl: ({ url }) => {
      console.log(
        `[login] open this URL in your browser if it doesn't open automatically:\n  ${url}`
      )
      openBrowser(url)
    },
    onProgress: (message) => {
      console.log(`[login] ${message}`)
    },
  })
  console.log(`[login] linked ChatGPT account ${creds.accountId}.`)
}

/** Best-effort cross-platform `xdg-open`/`open`/`start` shim. Failures
 *  are silent — the URL has already been printed for the user. */
function openBrowser(url: string): void {
  let cmd: string[]
  if (process.platform === "darwin") cmd = ["open", url]
  else if (process.platform === "win32") cmd = ["cmd", "/c", "start", "", url]
  else cmd = ["xdg-open", url]
  try {
    Bun.spawn(cmd, { stderr: "ignore", stdin: "ignore", stdout: "ignore" })
  } catch {
    // No `open` available — user can copy from the printed URL.
  }
}
