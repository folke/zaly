import type { MaybePromise } from "@zaly/shared"
import type { Logger } from "@zaly/shared/logger"
import type { BuiltinProvider } from "../providers/registry.ts"
import type {
  Cost,
  JsonValue,
  Modality,
  ModelInfo,
  ModelProvider,
  ModelSpec,
  ProviderOverride,
} from "../types.ts"
import type { ModelFilter } from "./filter.ts"

import { normPath } from "@zaly/shared"
import { mkdir, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { filterModels } from "./filter.ts"
import { builtinOverrides } from "./overrides.ts"

type CatalogProvider = {
  id: string
  /** NPM package name for the provider's adapter. */
  npm: string
  /** Base URL for the provider's API. */
  api?: string
  /** Provider id **/
  /** Provider name **/
  name: string
  /** Docs link for this provider's model list. */
  doc: string
  /** Env-var names consulted for credentials, in priority order.
   *  The first element is the conventional one (`OPENAI_API_KEY`
   *  etc.); downstream entries are fallbacks. */
  env?: string[]
  models: Record<string, CatalogModel>
}

/** Per-model provider overrides. When present, the adapter applies
 *  these on top of the preset defaults — lets individual models in a
 *  catalog target a different npm module, base URL, wire shape, or
 *  inject extra headers / body fields. Rare but used by hybrid
 *  catalogs (google-vertex, some aggregators). */
type ModelProviderOverride = {
  npm?: string
  api?: string
  shape?: "completions" | "responses"
  body?: Record<string, JsonValue>
  headers?: Record<string, string>
}

/** Experimental / preview modes for a model. Keys are mode names
 *  (`"search"`, `"vision"`, …) — providers use them to expose beta
 *  behaviour behind extra request fields. */
type ExperimentalModes = Record<
  string,
  {
    cost?: Cost
    provider?: {
      body?: Record<string, JsonValue>
      headers?: Record<string, string>
    }
  }
>

export type CatalogModel = ModelInfo & {
  /** Loose family grouping (`"gpt"`, `"claude"`, `"gemini"`, …).
   *  Informational; adapters don't branch on it. */
  family?: string
  /** Accepts file attachments (images / pdfs / etc.). */
  attachment?: boolean
  /** Emits reasoning / thinking tokens. */
  reasoning?: boolean
  /** Reasoning tokens interleave with output.
   *  - `true` — field defaults to `"reasoning_content"`.
   *  - `{ field }` — explicit field name (`"reasoning_content"` on
   *    most OpenAI-compatibles; `"reasoning_details"` on a few). */
  interleaved?: true | { field: "reasoning_content" | "reasoning_details" }
  /** Supports `response_format: { type: "json_schema", … }`. */
  structured_output?: boolean
  /** Accepts a `temperature` parameter. Reasoning models typically
   *  set this `false` (temperature is ignored or rejected). */
  temperature?: boolean
  modalities: {
    input: Modality[]
    output: Modality[]
  }
  limit: {
    context: number
    input?: number
    output: number
  }
  /** Lifecycle signal. `"deprecated"` entries are filtered out of our
   *  generated slices so this narrows to `"alpha" | "beta" | undefined`
   *  in practice, but the type includes `"deprecated"` for callers
   *  that read the raw catalog. */
  status?: "alpha" | "beta" | "deprecated"
  experimental?: {
    modes?: ExperimentalModes
  }
  provider?: ModelProviderOverride
}

type Catalog = Record<string, CatalogProvider | undefined>

const npmToApi: Record<string, BuiltinProvider | undefined> = {
  "@ai-sdk/anthropic": "anthropic",
  "@ai-sdk/openai": "openai-responses",
  "@ai-sdk/openai-compatible": "openai",
  "@openrouter/ai-sdk-provider": "openai",
}

const CATALOG_URL = "https://models.dev/api.json"
export const DEFAULT_CONTEXT_SIZE = 128_000
export const DEFAULT_MAX_TOKENS = 16_000

let catalog: Promise<ModelCatalog> | undefined

function isCatalog(data: unknown): data is Catalog {
  return typeof data === "object" && data !== null && !Array.isArray(data)
}

export async function getModel(id: string): Promise<ModelSpec | undefined> {
  const cat = await loadCatalog()
  return cat.get(id)
}

/** Split a model URI into `{ provider, model }`. Throws on malformed
 *  input — a typo at the call site is more useful surfaced here than
 *  via a downstream "unknown provider" error.
 *
 *  Examples:
 *    `"anthropic/claude-sonnet-4-5"` → `{ provider: "anthropic", model: "claude-sonnet-4-5" }`
 *    `"openrouter/kimi/k2"`          → `{ provider: "openrouter", model: "kimi/k2" }` */
export function parseModelId(id: string): [string, string] {
  const idx = id.indexOf("/")
  if (idx === -1)
    throw new Error(
      `Invalid model id "${id}": expected "<provider>/<model>" (e.g. "anthropic/claude-sonnet-4-5").`
    )
  return [id.slice(0, idx), id.slice(idx + 1)]
}

export async function downloadCatalog(dir: string): Promise<ModelCatalog> {
  dir = normPath(dir)
  await mkdir(dir, { recursive: true })
  const res = await fetch(CATALOG_URL)
  if (!res.ok) throw new Error(`Failed to fetch catalog: ${res.status} ${res.statusText}`)
  const raw = await res.text()
  const data = JSON.parse(raw)
  if (!isCatalog(data))
    throw new Error(`Invalid catalog format: expected object with "providers" key`)
  const cat = await ModelCatalog.load(data)
  const entries = Object.entries(cat.$).filter(([pid]) => !!cat.provider(pid))
  const cleaned = JSON.stringify(Object.fromEntries(entries)) // strip unsupported providers
  await writeFile(`${dir}/snapshot.json`, raw, "utf8")
  await writeFile(`${dir}/models.json`, cleaned, "utf8")
  return cat
}

export async function loadCatalog(path?: string): Promise<ModelCatalog> {
  return (catalog ??= ModelCatalog.load(path))
}

export class ModelCatalog {
  #catalog: Catalog
  #providers = new Map<string, ModelProvider<true>>()
  #overrides = new Map<string, ModelProvider<true>>()

  private constructor(cat: Catalog) {
    this.#catalog = cat
  }

  get $() {
    return this.#catalog
  }

  static async load(cat?: string | Catalog): Promise<ModelCatalog> {
    if (cat && typeof cat !== "string") return new ModelCatalog(cat).#load()
    const url = cat
      ? pathToFileURL(normPath(cat))
      : new URL("../../assets/models.json", import.meta.url)
    const m = await import(url.href, { with: { type: "json" } })
    return new ModelCatalog(m.default as unknown as Catalog).#load()
  }

  async fork(
    overrides: ProviderOverride[] = [],
    opts: { logger?: Logger } = {}
  ): Promise<ModelCatalog> {
    const cat = new ModelCatalog(this.#catalog)
    cat.#providers = this.#providers
    return cat.#update(overrides, opts)
  }

  async #load() {
    for (const [pid, p] of Object.entries(this.#catalog)) {
      const info = toProviderInfo(p)
      if (info) this.#providers.set(pid, info)
    }
    // Initial load just uses the built-in overrides
    return await this.#update()
  }

  async #update(
    overrides: ProviderOverride[] = [],
    opts: { logger?: Logger } = {}
  ): Promise<ModelCatalog> {
    this.#overrides.clear()
    const providers: ProviderOverride[] = []
    for (const [pid, p] of Object.entries(builtinOverrides))
      providers.push({ id: pid, ...p, source: "builtin" })
    providers.push(...overrides)

    // Rebuild the provider map from scratch, merging any runtime-registered
    // providers with the catalog's.
    this.#overrides.clear()
    for (const p of providers) {
      const next: ModelProvider = { name: p.id, ...p }
      const prev = this.#overrides.get(next.id) ?? this.#providers.get(next.id)
      const nextModels = p.replaceModels ? [] : [...(prev?.models ?? [])]

      try {
        // oxlint-disable-next-line no-await-in-loop
        nextModels.push(...(await resolveModels(next, this)))
      } catch (error) {
        if (!opts.logger) throw error
        opts.logger.error(`Failed to load models for provider \`${next.id}\`:`, error)
      }
      this.#overrides.set(next.id, { ...prev, ...next, models: nextModels })
    }

    for (const p of this.#overrides.values()) {
      const models = new Map<string, ModelInfo>()
      for (const m of p.models ?? []) {
        const prev = models.get(m.id)
        models.set(m.id, { ...prev, ...m })
      }
      p.models = [...models.values()]
    }
    return this
  }

  provider(id: string): ModelProvider<true> | undefined {
    return this.#overrides.get(id) ?? this.#providers.get(id)
  }

  get(modelId: string): ModelSpec | undefined {
    const [pid, mid] = parseModelId(modelId)
    const provider = this.provider(pid)
    if (!provider) return
    const info = provider.models?.find((m) => m.id === mid)
    return info ? toModelSpec(info, provider) : undefined
  }

  get providers(): readonly ModelProvider<true>[] {
    const ret: ModelProvider<true>[] = [...this.#overrides.values()]
    for (const p of this.#providers.values()) if (!this.#overrides.has(p.id)) ret.push(p)
    return ret
  }

  get models(): readonly ModelSpec[] {
    const ret: ModelSpec[] = []
    for (const p of this.providers) {
      if (!p.models) continue
      ret.push(...p.models.map((m) => toModelSpec(m, p)))
    }
    return ret
  }

  async list(filter?: ModelFilter): Promise<ModelSpec[]> {
    return filterModels(this.models, filter)
  }
}

export function resolveModels(
  provider: ModelProvider,
  cat: ModelCatalog
): MaybePromise<ModelInfo[]> {
  const models = provider.models
  if (models === undefined) return []
  if (Array.isArray(models)) return [...models]
  return models(cat)
}

function toProviderInfo(p?: CatalogProvider): ModelProvider<true> | undefined {
  if (!p) return
  const api = npmToApi[p.npm]
  if (!api) return
  const models: ModelInfo[] = []
  for (const m of Object.values(p.models)) {
    if (m.status === "deprecated") continue
    if (!m.tool_call) continue
    models.push(toModelInfo(m, p.id))
  }
  if (!models.length) return
  return {
    api,
    baseUrl: p.api,
    doc: p.doc,
    env: p.env ?? [],
    id: p.id,
    models,
    name: p.name,
    source: "models.dev",
  }
}

function toModelInfo(m: CatalogModel, pid: string): ModelInfo {
  const override = builtinOverrides[pid]
  return {
    // Only use the model's provider npm if the override doesn't specify an api.
    api: m.provider?.npm && !override?.api ? npmToApi[m.provider.npm] : undefined,
    baseUrl: m.provider?.api,
    contextSize: m.limit.context,
    cost: m.cost,
    id: m.id,
    input: m.modalities.input,
    knowledge: m.knowledge,
    last_updated: m.last_updated,
    maxTokens: m.limit.output,
    name: m.name,
    open_weights: m.open_weights,
    output: m.modalities.output,
    reasoning: m.reasoning ?? false,
    release_date: m.release_date,
  }
}

export function toModelSpec(model: ModelInfo, provider: ModelProvider): ModelSpec {
  const id = `${provider.id}/${model.id}`
  // oxlint-disable-next-line sort-keys
  return {
    name: id,
    input: ["text"],
    maxTokens: DEFAULT_MAX_TOKENS,
    contextSize: DEFAULT_CONTEXT_SIZE,
    ...model,
    id,
    model: model.id,
    api: model.api ?? provider.api ?? "openai",
    baseUrl: model.baseUrl ?? provider.baseUrl,
    headers: provider.headers,
    provider,
  }
}
