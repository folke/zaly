import type { BuiltinProvider } from "../providers/registry.ts"
import type { ModelInfo, ModelSpec, ModelProvider } from "../types.ts"
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
  models: Record<string, ModelInfo>
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
    this.#load()
  }

  get $() {
    return this.#catalog
  }

  static async load(path?: string): Promise<ModelCatalog> {
    const url = path
      ? pathToFileURL(normPath(path))
      : new URL("../../assets/models.json", import.meta.url)
    const m = await import(url.href, { with: { type: "json" } })
    return new ModelCatalog(m.default as unknown as Catalog)
  }

  #load() {
    for (const [pid, p] of Object.entries(this.#catalog)) {
      const info = toProviderInfo(p)
      if (info) this.#providers.set(pid, info)
    }
    for (const [pid, p] of Object.entries(modelProviders)) {
      const { models, ...info } = p
      this.#providers.set(pid, {
        ...info,
        id: pid,
        models: typeof models === "function" ? models(this) : models,
      })
    }
    for (const p of this.#providers.values()) {
      for (const [mid, m] of Object.entries(p.models)) {
        const spec = toModelSpec(m, p)
        this.#models.set(`${p.id}/${mid}`, spec)
      }
    }
    return this
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
  return {
    api,
    baseUrl: override?.baseUrl ?? p.api,
    doc: p.doc,
    env: p.env ?? [],
    headers: override?.headers,
    id: p.id,
    models: p.models,
    name: p.name,
    quirks: override?.quirks,
  }
}

function toModelSpec(model: ModelInfo, provider: ModelProvider): ModelSpec {
  const id = `${provider.id}/${model.id}`
  let api = provider.api
  const override = overrides[provider.id]
  if (model.provider?.npm && !override?.api) api = npmToApi[model.provider.npm] ?? provider.api
  // oxlint-disable-next-line sort-keys
  return {
    id,
    providerId: provider.id,
    name: model.name,
    modelId: model.id,
    api,
    baseUrl: model.provider?.api ?? provider.baseUrl,
    headers: provider.headers,
    reasoning: model.reasoning,
    input: model.modalities.input,
    output: model.modalities.output,
    maxTokens: model.limit.output,
    contextSize: model.limit.context,
    quirks: provider.quirks,
    env: provider.env,
    provider,
    info: model,
  }
}
