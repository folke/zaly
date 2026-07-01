import type { Agent } from "@zaly/agent"
import type { Model, ModelSpec } from "@zaly/ai"
import type { PickerItem } from "@zaly/tui/widgets/picker"
import type { App } from "./app.ts"

import { formatNumber, toError } from "@zaly/shared"
import { memo, signal } from "@zaly/tui"

type ModelItem = PickerItem & {
  model: ModelSpec
}

export async function pickModel(
  app: App,
  opts?: { all?: boolean; filter?: string; refresh?: boolean }
): Promise<Model | undefined> {
  const model = await app.ctx.models()
  if (opts?.refresh) model.refresh()
  const filter = opts?.filter ?? ""

  const [all, setAll] = signal(opts?.all ?? false)

  const auth = new Set(
    await model
      .list({
        auth: true,
        filter: filter.length > 0 ? filter : undefined,
      })
      .then((spec) => spec.map((m) => m.id))
  )

  const models = await model.list({
    filter: filter.length > 0 ? filter : undefined,
  })
  const modelItems: ModelItem[] = models.map((m) => {
    const name = (m.provider.name ? `[${m.provider.name}] ` : "") + m.name
    return {
      desc: [
        formatNumber(m.contextSize),
        m.reasoning ? "reasoning" : undefined,
        ...m.input.filter((mod) => mod !== "text").toSorted(),
      ]
        .filter(Boolean)
        .join(", "),
      model: m,
      name,
      text: `${m.id} ${name}`,
    }
  })

  const items = memo(() => {
    const want = all() ? () => true : (id: string) => auth.has(id)
    return modelItems.filter((m) => want(m.model.id))
  })

  const active = items().findIndex((m) => m.model.id === model.active?.id)

  const ret = await app.pick({
    actions: {
      "models.toggleAll": {
        cmd: "toggle-all",
        desc: "Toggle showing all models, including those without local auth",
        fn: () => setAll((prev) => !prev),
        keys: ["ctrl-a"],
      },
    },
    active: active !== -1 ? active : undefined,
    details: "Use `/login` to authenticate with a provider to unlock more models.",
    items,
    reverse: true,
    sort: ["score:desc", "idx"],
    title: "Select a model to use for this session (or type to filter)",
    whichKey: true,
  })

  if (!ret) return
  void app.config.state.update({ lastModel: ret.model.id })
  model.active = await model.load(ret.model.id)
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

  const model = await ctx.models()
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
