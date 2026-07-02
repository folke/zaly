import type { Agent } from "@zaly/agent"
import type { AppState } from "../types.ts"
import type { App } from "./app.ts"

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
  const { bootstrapModel } = await import("./model.ts")
  const ctx = app.ctx
  const session = await ctx.session()
  const settings = ctx.config.$
  const ss = session.settings
  const perm = settings.permissions

  const cwd = ctx.flags.cwd ?? ss.cwd ?? ctx.config.paths.cwd

  const agent = await createAgent({
    allow: async (req) => {
      const { allow } = await import("./permissions.ts")
      return await allow(req, app)
    },
    bash: settings.system.bash,
    compaction: () => app.$.compaction,
    cwd,
    loadModel: async (id) => {
      // Load the model using the proper model registry and auth manager
      const models = await ctx.models()
      return await models.load(id)
    },
    logger: ctx.logger.child("agent"),
    mask: () => app.$.masking,
    permissions: ctx.flags.yolo
      ? { preset: "yolo" }
      : {
          preset: ctx.flags.permission ?? perm.preset,
          rules: { allow: perm.allow, ask: perm.ask, deny: perm.deny },
        },
    session,
  })

  agent.ctx.on("reasoning", ({ effort }) => (app.state.reasoning = effort))
  agent.ctx.reasoning = ctx.flags.reasoning ?? ss.reasoning ?? settings.reasoning
  app.state.reasoning = agent.ctx.reasoning

  const tools = await app.ctx.tools()
  tools.onAny(async () => (agent.ctx.tools = await tools.load()))
  tools.active = ctx.config.$.tools

  const prompts = await ctx.prompts()
  const updatePrompt = async () => {
    const model = agent.ctx.model
    agent.ctx.prompt = (model ? await prompts.render({ cwd: agent.ctx.cwd, model }) : []).map(
      (p) => p.text
    )
  }
  prompts.onAny(updatePrompt)
  agent.ctx.on("cwd", updatePrompt)

  const models = await app.ctx.models()
  models.on("active", ({ active }) => (agent.ctx.model = active))
  models.on("register", async ({ value: spec }) => {
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
    if (models.active !== agent.ctx.model) models.active = agent.ctx.model
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
    .on("step-end", () => {
      state.usage = agent.usage
      state.step += 1
    })
    .on("status", ({ status }) => {
      const busy = status !== "idle" && status !== "paused"
      state.busy = busy
      state.status = status === "idle" ? "ready" : status
    })
    .on("stop", ({ kind }) => {
      if (kind !== "error") return
      state.status = "error"
      state.busy = false
      const err = agent.lastStop?.error
      if (err) console.error(`${err.name}: ${err.message}`)
    })
  agent.ctx.on("session", () => (state.usage = agent.usage))
  state.usage = agent.usage
}
