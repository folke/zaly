import type { ModelSpec } from "@zaly/ai"
import type { PluginApi } from "@zaly/plugin"

interface ModelsResponse {
  models: LMStudioModel[]
}

interface LMStudioModel {
  type: "llm" | "embedding"
  publisher: string
  key: string
  display_name: string
  architecture?: string | null
  quantization?: {
    name: string | null
    bits_per_weight: number | null
  } | null
  size_bytes: number
  params_string: string | null
  loaded_instances: {
    id: string
    config: {
      context_length: number
      eval_batch_size?: number
      parallel?: number
      flash_attention?: boolean
      num_experts?: number
      offload_kv_cache_to_gpu?: boolean
    }
  }[]
  max_context_length: number
  format: "gguf" | "mlx" | null
  capabilities?: {
    vision: boolean
    trained_for_tool_use: boolean
    reasoning?: {
      allowed_options: ("off" | "on" | "low" | "medium" | "high")[]
      default: "off" | "on" | "low" | "medium" | "high"
    }
  }
  description?: string | null
  variants?: string[]
  selected_variant?: string
}

const LM_STUDIO = "http://localhost:1234"

export async function fetchModels(baseUrl = LM_STUDIO): Promise<ModelSpec[]> {
  const models = await lmstudio<ModelsResponse>(`${baseUrl}/api/v1/models`)
  return models.models
    .filter((model) => model.type === "llm")
    .map((model) => toModelSpec(model, baseUrl))
}

async function lmstudio<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const token = process.env.LM_API_TOKEN
  if (token) headers.set("Authorization", `Bearer ${token}`)

  const res = await fetch(url, { ...init, headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()) as T
}

function toModelSpec(model: LMStudioModel, baseUrl: string): ModelSpec {
  const context = model.loaded_instances[0]?.config.context_length ?? model.max_context_length
  const output = Math.min(context, 8192)
  const vision = model.capabilities?.vision ?? false

  // oxlint-disable-next-line sort-keys
  return {
    id: `lm-studio/${model.key}`,
    name: model.display_name,
    model: model.key,
    api: "openai",
    baseUrl: `${baseUrl}/v1`,
    info: {
      family: model.architecture ?? undefined,
      open_weights: true,
      tool_call: model.capabilities?.trained_for_tool_use ?? false,
    },
    contextSize: context,
    maxTokens: output,
    input: vision ? ["text", "image"] : ["text"],
    output: ["text"],
    reasoning: model.capabilities?.reasoning !== undefined,
  }
}

export default async function LMStudioPlugin(api: PluginApi) {
  try {
    const models = await fetchModels()
    for (const model of models) {
      await api.model.register(`lm-studio/${model.id}`, model)
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    api.ui.notify(`Failed to fetch models. Is LM Studio running?\n* ${err.message}`, {
      level: "warn",
    })
  }
}
