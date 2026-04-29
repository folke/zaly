import type { Agent } from "@zaly/agent"
import type { Renderer } from "@zaly/tui"

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
        const node = renderer.getNode("composer") as { setState: (p: { cursor: number; value: string }) => void } | undefined
        node?.setState({ cursor: 0, value: "" })
      },
      name: "clear",
    },
    "app.help": {
      desc: "toggle help overlay",
      fn: ctx.toggleHelp,
      keys: ["ctrl-h"],
      name: "help",
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
