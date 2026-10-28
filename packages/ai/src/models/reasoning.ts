import type { ReasoningEffort } from "../provider.ts"
import type { ModelInfo, ModelProvider } from "../types.ts"

const efforts: ReasoningEffort[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

/** Available user-facing effort levels, in increasing order. Explicit quirks override catalog metadata. */
export function reasoningLevels(
  model: ModelInfo & { provider?: Pick<ModelProvider, "quirks"> }
): ReasoningEffort[] {
  if (model.reasoning !== true) return []
  const override = model.provider?.quirks?.reasoningLevels
  if (override) return efforts.filter((effort) => override.includes(effort))
  const options = model.reasoning_options
  if (!options) return [...efforts]
  const configured = options.find((option) => option.type === "effort")
  const budget = options.some((option) => option.type === "budget_tokens")
  const canDisable =
    budget ||
    options.some((option) => option.type === "toggle") ||
    configured?.values.includes("none")
  if (!configured) {
    if (budget) return [...efforts]
    return canDisable ? ["off", "medium"] : ["low"]
  }
  return efforts.filter((effort) =>
    effort === "off" ? canDisable : configured.values.includes(effort)
  )
}

/** Resolve a requested effort once for replay, estimation, UI, and adapter translation. */
export function resolveReasoning(
  model: ModelInfo & { provider?: Pick<ModelProvider, "quirks"> },
  requested?: ReasoningEffort
): ReasoningEffort | undefined {
  if (requested === undefined) return
  const levels = reasoningLevels(model)
  if (!levels.length) return
  if (levels.includes(requested)) return requested
  const position = efforts.indexOf(requested)
  const candidates = requested === "off" ? levels : levels.filter((effort) => effort !== "off")
  return (
    candidates.findLast((effort) => efforts.indexOf(effort) <= position) ??
    candidates.at(0) ??
    levels[0]
  )
}
