import type { Agent } from "@zaly/agent"
import type { AppState } from "../types.ts"
import type { App } from "./app.ts"

import { registerSecrets } from "@zaly/ai"
import { toError } from "@zaly/shared"

export async function bootstrapModel(
  agent: Agent,
  app: App,
  opts: { notify?: boolean; force?: boolean } = {}
): Promise<void> {
  const ctx = app.ctx
  const config = await ctx.config()
  const settings = config.settings
  const modelId = ctx.flags.model ?? agent.session.settings.modelId ?? settings.model
  if (!modelId) return
  const model = await ctx.model()
  if (model.active && !opts.force) return
  try {
    model.active = await model.load({ apiKey: ctx.flags.apiKey, id: modelId })
  } catch (error) {
    if (opts.notify)
      app.notify(`Failed to load model **${modelId}**:\n${toError(error).message}`, {
        level: "error",
        title: "Model Load Error",
      })
  }
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

  agent.ctx.on("reasoning", ({ effort }) => (app.state.reasoning = effort))
  agent.ctx.reasoning = ctx.flags.reasoning ?? ss.reasoning ?? settings.reasoning ?? "medium"

  const tools = await app.ctx.tools()
  tools.onAny(async () => (agent.ctx.tools = await tools.load()))
  tools.active = config.settings.tools ?? []

  const prompts = await ctx.prompts()
  const updatePrompt = async () => {
    const model = agent.ctx.model
    agent.ctx.prompt = model ? await prompts.render({ cwd: agent.ctx.cwd, model }) : []
  }
  prompts.onAny(updatePrompt)
  agent.ctx.on("cwd", updatePrompt)

  const model = await app.ctx.model()
  model.on("active", ({ active }) => (agent.ctx.model = active))
  model.on("register", async ({ value: spec }) => {
    if (app.ready) return
    // Plugins can register models during startup
    if (!agent.model || agent.model.id === spec.id)
      await bootstrapModel(agent, app, { force: true, notify: true })
  })

  agent.ctx.on("model", async () => {
    app.state.model = agent.ctx.model
    // no-op if set through model.active, but needed when switching
    // via agent.ctx.useSession(), since that loads the session's model
    // directly into agent.ctx.model, bypassing model.active's setter.
    if (model.active !== agent.ctx.model) model.active = agent.ctx.model
    await updatePrompt()
  })

  await bootstrapModel(agent, app)
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
  agent.ctx.on("session", () => (state.usage = agent.usage))
  state.usage = agent.usage
}
