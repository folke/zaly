import type { Agent } from "@zaly/agent"
import type { Model } from "@zaly/ai"
import type { AppState } from "../types.ts"
import type { App } from "./app.ts"

import { getModel, registerSecrets } from "@zaly/ai"

export async function loadAgentModel(app: App): Promise<Model | undefined> {
  const { loadModel } = await import("@zaly/ai")
  const ctx = app.ctx
  const session = await ctx.session()
  const config = await ctx.config()
  const settings = config.settings
  const modelId = ctx.flags.model ?? session.settings.modelId ?? settings.model
  const spec = modelId ? await getModel(modelId) : undefined
  if (!spec || !modelId) return
  return await loadModel({ apiKey: ctx.flags.apiKey, id: modelId })
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

  if (config.user.settings?.secrets) await registerSecrets(config.user.settings.secrets)

  const cwd = ctx.flags.cwd ?? ss.cwd ?? config.paths.cwd

  const agent = await createAgent({
    allow: async (req) => {
      const { allow } = await import("./permissions.ts")
      return await allow(req, app)
    },
    cwd,
    logger: ctx.logger.child("agent"),
    permissions: ctx.flags.yolo
      ? { preset: "yolo" }
      : {
          preset: ctx.flags.permission ?? p.preset,
          rules: { allow: p.allow, ask: p.ask, deny: p.deny },
        },
    session,
  })

  agent.ctx.on("model", () => (app.state.model = agent.model))
  agent.ctx.model = await loadAgentModel(app)

  agent.ctx.on("reasoning", ({ effort }) => (app.state.reasoning = effort))
  agent.ctx.reasoning = ctx.flags.reasoning ?? ss.reasoning ?? settings.reasoning ?? "medium"

  const tools = await app.ctx.tools()
  tools.on("change", () => (agent.ctx.tools = tools.active))
  await tools.select(config.settings.tools ?? [])

  return agent
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
export function attachState(agent: Agent, state: AppState): void {
  agent
    .on("step-end", () => (state.usage = agent.usage))
    .on("status", ({ status }) => {
      const busy = status !== "idle" && status !== "paused"
      state.busy = busy
      state.status = status === "idle" ? "ready" : status
    })
    .on("stop", ({ kind }) => {
      if (kind !== "error") return
      state.status = "error"
      const err = agent.lastStop?.error
      if (err) console.error(`${err.name}: ${err.message}`)
    })
  state.usage = agent.usage
}
