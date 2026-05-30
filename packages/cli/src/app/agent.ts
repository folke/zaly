import type { Agent } from "@zaly/agent"
import type { Model, Usage } from "@zaly/ai"
import type { Setter } from "@zaly/tui"
import type { AppState } from "../types.ts"
import type { App } from "./app.ts"

import { getModel } from "@zaly/ai"

export async function loadAgentModel(app: App): Promise<Model | undefined> {
  const { loadModel } = await import("@zaly/ai")
  const ctx = app.ctx
  const session = await ctx.session()
  const config = await ctx.config()
  const settings = config.settings
  const ss = session.settings

  const modelId = ctx.flags.model ?? ss.modelId ?? settings.model
  const spec = modelId ? await getModel(modelId) : undefined
  if (!spec || !modelId) return
  return await loadModel(modelId, { apiKey: ctx.flags.apiKey })
}

/** Default tool list when `--tools` isn't passed. Mirrors the previous
 *  hard-coded set; can be narrowed per-run via `--tools a,b,c`. */

/**
 * Build a fresh Agent from a resolved `Config` and a pre-loaded
 * session. Pre-loading the session lets the TUI paint replay history
 * before the agent's model + auth resolution finishes (Phase B). The
 * model id is resolved against the session here (not in `resolveConfig`)
 * because the session has to be loaded async first.
 */
export async function loadAgent(app: App): Promise<Agent> {
  const { createAgent } = await import("@zaly/agent")
  const ctx = app.ctx
  const session = await ctx.session()
  const config = await ctx.config()
  const settings = config.settings
  const ss = session.settings
  const p = settings.permissions ?? {}

  const merged = {
    cwd: ctx.flags.cwd ?? ss.cwd ?? config.paths.cwd,
    reasoning: ctx.flags.reasoning ?? ss.reasoning ?? settings.reasoning,
  }

  const reasoning = merged.reasoning ? { effort: merged.reasoning } : undefined

  return await createAgent({
    allow: (req) => app.allow(req),
    cwd: merged.cwd,
    logger: ctx.logger.child("agent"),
    model: await loadAgentModel(app),
    permissions: ctx.flags.yolo
      ? { preset: "yolo" }
      : {
          preset: ctx.flags.permission ?? p.preset,
          rules: { allow: p.allow, ask: p.ask, deny: p.deny },
        },
    request: { reasoning },
    session,
    skills: { paths: await config.resources.skills() },
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
export function wireAgent(agent: Agent, state: AppState, opts?: { signal?: AbortSignal }): void {
  agent
    .on("step-end", () => (state.usage = agent.usage), opts)
    .on(
      "status",
      ({ status }) => {
        const busy = status !== "idle" && status !== "paused"
        state.busy = busy
        state.status = status === "idle" ? "ready" : status
      },
      opts
    )
    .on(
      "stop",
      ({ kind }) => {
        if (kind !== "error") return
        state.status = "error"
        const err = agent.lastStop?.error
        if (err) console.error(`${err.name}: ${err.message}`)
      },
      opts
    )
  state.usage = agent.usage
}
