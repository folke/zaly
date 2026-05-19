import type { Agent } from "@zaly/agent"
import type { Usage } from "@zaly/ai"
import type { Setter } from "@zaly/tui"
import type { AppContext } from "./app.ts"

/** Default tool list when `--tools` isn't passed. Mirrors the previous
 *  hard-coded set; can be narrowed per-run via `--tools a,b,c`. */

/**
 * Build a fresh Agent from a resolved `Config` and a pre-loaded
 * session. Pre-loading the session lets the TUI paint replay history
 * before the agent's model + auth resolution finishes (Phase B). The
 * model id is resolved against the session here (not in `resolveConfig`)
 * because the session has to be loaded async first.
 */
export async function buildAgent(ctx: AppContext): Promise<Agent> {
  const { createAgent } = await import("@zaly/agent")
  const { loadModel } = await import("@zaly/ai")
  const { resolveModelId } = await import("./model.ts")
  const modelId = await resolveModelId(ctx.flags, ctx.session)
  const model = await loadModel(modelId, { apiKey: ctx.flags.apiKey })
  const settings = ctx.config.settings

  const reasoning = settings.reasoning ? { effort: settings.reasoning } : undefined

  return await createAgent({
    model,
    permissions: ctx.flags.yolo ? { preset: "yolo" } : undefined,
    request: { reasoning },
    session: ctx.session,
    skills: await ctx.config.resources.skills(),
    tools: settings.tools,
  })
}

export interface AgentSignals {
  setBusy: Setter<boolean>
  setStatus: Setter<string>
  setUsage: Setter<Usage>
}

/**
 * Wire an Agent to the App's UI signals. Pass an AbortSignal via `opts`
 * to detach every handler in one shot (e.g. on agent reset).
 *
 * `busy` and `status` are driven from the agent's authoritative state
 * machine (`agent.on("status")`), covering submit (`streaming`), tool
 * runs (`running-tools`), `/compact` (`compacting`), and abort
 * (`paused`) uniformly. `usage` refreshes on `step-end` since
 * `agent.usage` reflects the last response by then.
 */
export function wireAgent(
  agent: Agent,
  signals: AgentSignals,
  opts?: { signal?: AbortSignal }
): void {
  agent
    .on("step-end", () => signals.setUsage(agent.usage), opts)
    .on(
      "status",
      ({ status }) => {
        const busy = status !== "idle" && status !== "paused"
        signals.setBusy(busy)
        signals.setStatus(status === "idle" ? "ready" : status)
      },
      opts
    )
    .on(
      "stop",
      ({ kind }) => {
        if (kind !== "error") return
        signals.setStatus("error")
        const err = agent.lastStop?.error
        if (err) console.error(`${err.name}: ${err.message}`)
      },
      opts
    )

  // Seed usage from the tail of any resumed conversation.
  const last = agent.messages.at(-1)
  const usage = last?.role === "assistant" ? last.meta?.usage : undefined
  if (usage) signals.setUsage(usage)
}
