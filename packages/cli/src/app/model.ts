import type { Agent } from "@zaly/agent"
import type { Model } from "@zaly/ai"
import type { Option } from "@zaly/tui/widgets/select"
import type { App } from "./app.ts"

import { formatNumber, toError } from "@zaly/shared"

export async function pickModel(
  app: App,
  opts?: { all?: boolean; filter?: string }
): Promise<Model | undefined> {
  const model = await app.ctx.model()
  const filter = opts?.filter ?? ""
  const models = await model.list({
    auth: opts?.all ? undefined : true,
    filter: filter.length > 0 ? filter : undefined,
  })

  const items: Option[] = []
  for (const m of models) {
    items.push({
      desc: [
        formatNumber(m.contextSize),
        m.reasoning ? "reasoning" : undefined,
        ...m.input.filter((mod) => mod !== "text").toSorted(),
      ]
        .filter(Boolean)
        .join(", "),
      name: (m.providerInfo?.name ? `[${m.providerInfo.name}] ` : "") + m.name,
      text: m.id,
    })
  }
  const ret = await app.pick({
    items,
    reverse: true,
    sort: ["score:desc", "idx"],
  })
  if (!ret) return
  void app.config.state.update({ lastModel: ret.text })
  model.active = await model.load(ret.text)
  return model.active
}

export async function bootstrapModel(
  agent: Agent,
  app: App,
  opts: { notify?: boolean; force?: boolean } = {}
): Promise<void> {
  const ctx = app.ctx
  const settings = ctx.config.$

  // Resolve model ID from flags, session, config, or last used model
  const modelId =
    ctx.flags.model ??
    agent.session.settings.modelId ??
    settings.model ??
    app.config.state.$.lastModel
  if (!modelId) return

  const model = await ctx.model()
  if (model.active && !opts.force) return
  try {
    model.active = await model.load({ apiKey: ctx.flags.apiKey, id: modelId })
    // Only update lastModel from flags if it could actually be loaded
    if (ctx.flags.model) void app.config.state.update({ lastModel: ctx.flags.model })
  } catch (error) {
    if (opts.notify)
      app.notify(`Failed to load model **${modelId}**:\n${toError(error).message}`, {
        level: "error",
        title: "Model Load Error",
      })
  }
}
