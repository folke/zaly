import type { PromptCtx } from "./registry.ts"

export async function prompt(ctx: PromptCtx): Promise<string> {
  const model = ctx.model.spec
  const provider = model.providerId
  const modelId = model.modelId
  const modsIn = model.input
  const modsOut = model.output ?? []
  const info = model.info

  const lines = [
    "## Model",
    `- Id: ${modelId}`,
    `- Name: ${model.name}`,
    `- Provider: ${provider}`,
    `- Max tokens: ${model.maxTokens}`,
    info?.knowledge ? `- Knowledge cutoff: ${info.knowledge}` : undefined,
    info?.release_date ? `- Release date: ${info.release_date}` : undefined,
    info?.last_updated ? `- Last updated: ${info.last_updated}` : undefined,
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
