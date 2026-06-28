import type { ModelInfo } from "@zaly/ai"
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

export async function fetchModels(): Promise<ModelInfo[]> {
  const models = await lmstudio<ModelsResponse>(`${LM_STUDIO}/api/v1/models`)
  return models.models.filter((model) => model.type === "llm").map((model) => toModel(model))
}

async function lmstudio<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  const res = await fetch(url, { ...init, headers })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
  return (await res.json()) as T
}

function toModel(model: LMStudioModel): ModelInfo {
  const context = model.loaded_instances[0]?.config.context_length ?? model.max_context_length
  const output = Math.min(context, 8192)
  const vision = model.capabilities?.vision ?? false

  // oxlint-disable-next-line sort-keys
  return {
    id: model.key,
    name: model.display_name,
    tool_call: model.capabilities?.trained_for_tool_use ?? false,
    open_weights: true,
    contextSize: context,
    maxTokens: output,
    input: vision ? ["text", "image"] : ["text"],
    output: ["text"],
    reasoning: model.capabilities?.reasoning !== undefined,
  }
}

export default async function LMStudioPlugin(api: PluginApi) {
  // oxlint-disable-next-line sort-keys
  api.model.register({
    id: "lm-studio",
    name: "LM Studio",
    api: "openai",
    baseUrl: `${LM_STUDIO}/v1`,
    env: ["LM_STUDIO_API_KEY"],
    models: () =>
      fetchModels().catch((error) => {
        const err = error instanceof Error ? error : new Error(String(error))
        api.ui.notify(`Failed to fetch models. Is LM Studio running?\n* ${err.message}`, {
          level: "warn",
        })
        return []
      }),
  })
}
