import type { BuiltinProvider } from "../providers/registry.ts"
import type { ModelInfo, ModelSpec, ModelProvider, Modality, JsonValue, Cost } from "../types.ts"
import type { ModelFilter } from "./filter.ts"

import { normPath } from "@zaly/shared"
import { mkdir, writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { filterModels } from "./filter.ts"
import { modelProviders, overrides } from "./overrides.ts"

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

let catalog: Promise<ModelCatalog> | undefined

function isCatalog(data: unknown): data is Catalog {
  return typeof data === "object" && data !== null && !Array.isArray(data)
}

export async function getModel(id: string): Promise<ModelSpec | undefined> {
  const cat = await loadCatalog()
  return cat.get(id)
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
  const cat = new ModelCatalog(data)
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
  #catalog!: Catalog
  #providers = new Map<string, ModelProvider>()
  #models = new Map<string, ModelSpec>()

  constructor(cat: Catalog) {
    this.#catalog = cat
  }

  get $() {
    return this.#catalog
  }

  static async load(path?: string): Promise<ModelCatalog> {
    const url = path
      ? pathToFileURL(normPath(path))
      : new URL("../../assets/models.json", import.meta.url)
    const m = await import(url.href, { with: { type: "json" } })
    return new ModelCatalog(m.default as unknown as Catalog).#load()
  }

  async #load() {
    for (const [pid, p] of Object.entries(this.#catalog)) {
      const info = toProviderInfo(p)
      if (info) this.#providers.set(pid, info)
    }
    for (const [pid, p] of Object.entries(modelProviders)) this.#providers.set(pid, p)

    for (const p of this.#providers.values()) {
      // PERF: fast-path for static model objects
      const specs =
        // oxlint-disable-next-line no-await-in-loop
        typeof p.models === "function" ? await this.modelSpecs(p) : this.#modelSpecs(p.models, p)
      for (const spec of specs) this.#models.set(spec.id, spec)
    }
    return this
  }

  #modelSpecs(models: ModelInfo[], provider: ModelProvider): ModelSpec[] {
    return models.map((m) => toModelSpec(m, provider))
  }

  async modelSpecs(provider: ModelProvider): Promise<ModelSpec[]> {
    const models =
      typeof provider.models === "function" ? await provider.models(this) : provider.models
    return this.#modelSpecs(models, provider)
  }

  provider(id: string): ModelProvider | undefined {
    return this.#providers.get(id)
  }

  get(modelId: string): ModelSpec | undefined {
    return this.#models.get(modelId)
  }

  get providers(): readonly ModelProvider[] {
    return [...this.#providers.values()]
  }

  get models(): readonly ModelSpec[] {
    return [...this.#models.values()]
  }

  async list(filter?: ModelFilter): Promise<Record<string, ModelSpec>> {
    return filterModels(this.models, filter)
  }
}

function toProviderInfo(p?: CatalogProvider): ModelProvider | undefined {
  if (!p) return
  const override = overrides[p.id]
  const api = override?.api ?? npmToApi[p.npm]
  if (!api) return
  const models: ModelInfo[] = []
  for (const m of Object.values(p.models)) {
    if (m.status === "deprecated") continue
    if (!m.tool_call) continue
    models.push(toModelInfo(m))
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
    ...override,
  }
}

function toModelInfo(m: CatalogModel): ModelInfo {
  return {
    api: m.provider?.npm ? npmToApi[m.provider.npm] : undefined,
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

function toModelSpec(model: ModelInfo, provider: ModelProvider): ModelSpec {
  const id = `${provider.id}/${model.id}`
  let api = provider.api
  const override = overrides[provider.id]
  if (model.api && !override?.api) api = model.api ?? provider.api
  // oxlint-disable-next-line sort-keys
  return {
    ...model,
    id,
    model: model.id,
    api,
    apiKey: provider.apiKey,
    baseUrl: model.baseUrl ?? provider.baseUrl,
    headers: provider.headers,
    provider,
  }
}
