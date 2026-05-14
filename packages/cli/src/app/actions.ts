import type { Agent } from "@zaly/agent"
import type { Input, Renderer } from "@zaly/tui"

/**
 * UI-only actions — registered in Phase A (no agent required).
 * Composer state, help overlay toggle, process exit. Each shows up in
 * the help overlay and in `/`-triggered autocomplete.
 */
export function registerUiActions(opts: {
  renderer: Renderer
  composer: Input
  toggleHelp: () => void
}): void {
  const { renderer, composer, toggleHelp } = opts
  renderer.actions.register({
    "app.clear": {
      desc: "clear the composer",
      fn: () => {
        composer.setState({ cursor: 0, value: "" })
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
          process.stderr.write(
            `[login] failed: ${error instanceof Error ? error.message : String(error)}\n`
          )
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
  })
}

/**
 * Agent-dependent actions — registered in Phase B once `buildAgent`
 * resolves. Hot-add to the registry: the help overlay subscribes via
 * `actions.onChange` and re-renders as soon as these appear.
 */
export function registerAgentActions(opts: {
  renderer: Renderer
  agent: Agent
  reset: () => Promise<void>
}): void {
  const { renderer, agent, reset } = opts
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
    "app.reset": {
      desc: "start a fresh session",
      fn: () => void reset(),
      name: "reset",
    },
    "app.stop": {
      desc: "abort the current run",
      fn: () => agent.abort(),
      keys: ["ctrl-x"],
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
  const codexAuth = await authRegistry.load("codex")

  const creds = await codexAuth.login({
    onAuthUrl: ({ url }) => {
      process.stdout.write(
        `[login] open this URL in your browser if it doesn't open automatically:\n  ${url}\n`
      )
      openBrowser(url)
    },
    onProgress: (message) => {
      process.stdout.write(`[login] ${message}\n`)
    },
  })
  process.stdout.write(`[login] linked ChatGPT account ${creds.accountId}.\n`)
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
