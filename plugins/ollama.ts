import type { ModelSpec } from "@zaly/ai"
import type { PluginApi } from "@zaly/plugin"

interface ModelResponse {
  name: string
  modified_at: Date
  model: string
  size: number
  digest: string
  details: ModelDetails
  expires_at: Date
  size_vram: number
}

interface ModelDetails {
  parent_model: string
  format: string
  family: string
  families: string[]
  parameter_size: string
  quantization_level: string
}

export interface ShowResponse {
  license: string
  modelfile: string
  parameters: string
  template: string
  system: string
  details: ModelDetails
  modified_at: Date
  model_info: Record<string, any>
  capabilities: string[]
  projector_info?: Record<string, any>
  tensors?: unknown
}

export interface ListResponse {
  models: ModelResponse[]
}

const OLLAMA = "http://localhost:11434"

export async function fetchModels(baseUrl = OLLAMA): Promise<ModelSpec[]> {
  const tags = await ollama<ListResponse>(`${baseUrl}/api/tags`)

  return await Promise.all(
    tags.models.map(async (model) => {
      const details = await ollama<ShowResponse>(`${baseUrl}/api/show`, {
        body: JSON.stringify({ model: model.name }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      })

      return toModelSpec(model, details, baseUrl)
    })
  )
}

async function ollama<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()) as T
}

function toModelSpec(model: ModelResponse, show: ShowResponse, baseUrl: string): ModelSpec {
  const capabilities = new Set(show.capabilities)
  const context = contextLength(show) ?? 131_072
  const output = outputLength(show) ?? Math.min(context, 8192)
  const vision = capabilities.has("vision") || show.projector_info !== undefined
  const family = show.details.family || model.details.family || undefined

  return {
    attachment: vision,
    baseUrl: `${baseUrl}/v1`,
    family,
    id: model.name,
    limit: { context, output },
    modalities: {
      input: vision ? ["text", "image"] : ["text"],
      output: ["text"],
    },
    name: model.name,
    open_weights: true,
    provider: "openai",
    reasoning: capabilities.has("thinking"),
    release_date: date(model.modified_at),
    tool_call: capabilities.has("tools"),
  }
}

function contextLength(show: ShowResponse): number | undefined {
  return findNumber(show.model_info, [
    ".context_length",
    ".max_position_embeddings",
    "context_length",
    "n_ctx",
  ])
}

function outputLength(show: ShowResponse): number | undefined {
  return findNumber(show.model_info, [".max_length", ".max_sequence_length", "max_tokens"])
}

function findNumber(info: Record<string, any>, suffixes: string[]): number | undefined {
  for (const [key, value] of Object.entries(info)) {
    if (typeof value !== "number") continue
    if (suffixes.some((suffix) => key === suffix || key.endsWith(suffix))) return value
  }
}

function date(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10)
}

export default async function OllamaPlugin(api: PluginApi) {
  const models = await fetchModels()
  console.log(models)
  for (const model of models) {
    await api.model.register(`ollama/${model.id}`, model)
  }
}
