import type { PromptCtx } from "./index.ts"

import { parseModelId } from "@zaly/ai"

export async function prompt(ctx: PromptCtx): Promise<string> {
  const model = ctx.model.spec
  const { provider, model: modelId } = parseModelId(ctx.model.id)
  const modsIn = model.modalities.input
  const modsOut = model.modalities.output

  const lines = [
    "## Model",
    `- Id: ${modelId}`,
    `- Name: ${model.name}`,
    `- Provider: ${provider}`,
    `- Max tokens: ${model.maxTokens}`,
    model.knowledge ? `- Knowledge cutoff: ${model.knowledge}` : undefined,
    model.release_date ? `- Release date: ${model.release_date}` : undefined,
    model.last_updated ? `- Last updated: ${model.last_updated}` : undefined,
    modsIn.length > 0 || modsOut.length > 0
      ? [
          "\n### Modalities",
          modsIn.length ? `- Input modalities: ${modsIn.join(", ")}` : undefined,
          modsOut.length ? `- Output modalities: ${modsOut.join(", ")}` : undefined,
        ]
      : undefined,
  ]

  return lines.flat().filter(Boolean).join("\n")
}
