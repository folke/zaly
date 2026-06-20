import type { AuthProvider } from "./auth/auth.ts"
import type { AnyProvider } from "./providers/registry.ts"
import type { Modality, ModelInfo, ModelSpec, ProviderInfo, Quirks } from "./types.ts"

import { hasAuth } from "./auth/auth.ts"

export type StoredModel = ModelInfo & {
  api: AnyProvider
  baseUrl?: string
  quirks?: Quirks
  headers?: Record<string, string>
}

/** On-disk catalog shape emitted by `scripts/build-providers.ts`. */
export interface ModelCatalog {
  providers: Record<string, ProviderInfo>
  models: Record<string, StoredModel>
}

/** Split a model URI into `{ provider, model }`. Throws on malformed
 *  input — a typo at the call site is more useful surfaced here than
 *  via a downstream "unknown provider" error.
 *
 *  Examples:
 *    `"anthropic/claude-sonnet-4-5"` → `{ provider: "anthropic", model: "claude-sonnet-4-5" }`
 *    `"openrouter/kimi/k2"`          → `{ provider: "openrouter", model: "kimi/k2" }` */
export function parseModelId(id: string): { provider: string; model: string } {
  const [, provider, model] = /^([^/]+)\/(.+)$/.exec(id) ?? []
  if (!provider || !model) {
    throw new Error(
      `Invalid model id "${id}": expected "<provider>/<model>" (e.g. "anthropic/claude-sonnet-4-5").`
    )
  }
  return { model, provider }
}

// ── Catalog loading ─────────────────────────────────────────────────────
//
// One JSON import covers the whole catalog — both the `providers` map
// (shared metadata) and the `models` map (pre-resolved ModelOptions,
// minus `providerInfo` which is joined in at lookup time from the
// `providers` map).

let catalogPromise: Promise<ModelCatalog> | undefined

function loadCatalog(): Promise<ModelCatalog> {
  const url = new URL("../assets/models.json", import.meta.url).href
  catalogPromise ??= import(url, { with: { type: "json" } }).then(
    (m) => m.default as unknown as ModelCatalog
  )
  return catalogPromise
}

// ── Runtime-registered custom catalog ───────────────────────────────────

/** Look up model options by id. Custom models win over built-ins.
 *  Built-in entries come pre-resolved from the generator — quirks,
 *  baseUrl, headers, maxTokens are all baked in; we just attach
 *  `providerInfo` from the shared providers map. */
export async function getModel(id: string): Promise<ModelSpec | undefined> {
  const catalog = await loadCatalog()
  const stored = catalog.models[id] as StoredModel | undefined
  return stored ? toModelSpec(id, stored, catalog) : undefined
}

/** Predicate inputs for narrowing a model list.
 *
 *  - `auth`      — only models whose credentials this provider resolves
 *                  (use `envAuth` for env-based, chain OAuth providers
 *                  for richer logic). Absent → no availability filter.
 *  - `reasoning` — match the model's `reasoning` capability exactly.
 *  - `modality`  — shorthand form (`Modality` / `Modality[]`) matches
 *                  against INPUT (common case — "accepts image").
 *                  Explicit form `{ input?, output? }` lets callers
 *                  narrow on generation direction too. */
export interface ModelFilter {
  auth?: AuthProvider | true
  reasoning?: boolean
  contextSize?: number
  modality?:
    | Modality
    | Modality[]
    | { input?: Modality | Modality[]; output?: Modality | Modality[] }
  filter?: string | ((m: ModelSpec) => boolean)
}

export async function filterModel(m: ModelSpec, opts?: ModelFilter): Promise<boolean> {
  if (opts?.auth !== undefined && !(await hasAuth(m, opts.auth === true ? undefined : opts.auth)))
    return false
  if (opts?.reasoning !== undefined && m.reasoning !== opts.reasoning) return false
  if (opts?.modality !== undefined && !matchesModality(m, opts.modality)) return false
  if (opts?.contextSize !== undefined && m.contextSize < opts.contextSize) return false
  if (
    opts?.filter !== undefined &&
    typeof opts.filter === "string" &&
    !m.id.includes(opts.filter.toLowerCase())
  )
    return false
  if (opts?.filter !== undefined && typeof opts.filter === "function" && !opts.filter(m))
    return false
  return true
}

/** Normalise the shorthand/object form and check membership against
 *  the model's declared input/output modalities. Shorthand targets
 *  input because "find me a vision model" is the common case. */
function matchesModality(m: ModelSpec, spec: NonNullable<ModelFilter["modality"]>): boolean {
  const input: Modality[] = []
  const output: Modality[] = []
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const arr = (x?: Modality | Modality[]) => (typeof x === "string" ? [x] : (x ?? []))
  if (typeof spec === "string" || Array.isArray(spec)) input.push(...arr(spec))
  else {
    input.push(...arr(spec.input))
    output.push(...arr(spec.output))
  }
  // "model must accept all these modalities"
  return (
    input.every((mod) => m.input.includes(mod)) && output.every((mod) => m.output?.includes(mod))
  )
}

/** Every model we know about, keyed by id. Includes runtime-registered
 *  custom models. For just ids (autocomplete sources), use
 *  `listModelIds` — one compact JSON, no catalog load needed. */
export async function filterModels(
  models: ModelSpec[],
  opts?: ModelFilter
): Promise<Record<string, ModelSpec>> {
  models.sort((a, b) => {
    const ap = a.providerInfo?.name ?? "0"
    const bp = b.providerInfo?.name ?? "0"
    if (ap && bp && ap !== bp) return ap.localeCompare(bp)
    const ka = a.info?.release_date ?? a.info?.last_updated ?? a.id
    const kb = b.info?.release_date ?? b.info?.last_updated ?? b.id
    if (ka !== kb) return -ka.localeCompare(kb)
    return a.name.localeCompare(b.name)
  })

  // Run filters in parallel — `auth.getAuth` may be async (OAuth,
  // keychain); sequential await would serialise 2400 lookups.
  const verdicts = await Promise.all(models.map((m) => filterModel(m, opts)))
  const out: Record<string, ModelSpec> = {}
  for (const [i, m] of models.entries()) {
    if (verdicts[i]) out[m.id] = m
  }
  return out
}

/** Every model we know about, keyed by id. Includes runtime-registered
 *  custom models. For just ids (autocomplete sources), use
 *  `listModelIds` — one compact JSON, no catalog load needed. */
export async function listModels(opts?: ModelFilter): Promise<Record<string, ModelSpec>> {
  // FIXME: filter should also apply to custom models?
  const catalog = await loadCatalog()
  const models: ModelSpec[] = Object.entries(catalog.models).map(([id, stored]) =>
    toModelSpec(id, stored, catalog)
  )
  return await filterModels(models, opts)
}

/** Built-in providers map. Exposed so callers can read endpoint
 *  metadata directly (names, docs URLs, env-var names) for pickers
 *  or admin tooling. */
export async function builtinProviders(): Promise<Readonly<Record<string, ProviderInfo>>> {
  const catalog = await loadCatalog()
  return catalog.providers
}

function toModelSpec(id: string, model: StoredModel, catalog: ModelCatalog): ModelSpec {
  const provider = catalog.providers[parseModelId(id).provider] as ProviderInfo | undefined
  if (!provider)
    throw new Error(`Provider "${parseModelId(id).provider}" not found for model "${id}".`)
  // oxlint-disable-next-line sort-keys
  return {
    id,
    name: model.name,
    model: model.id,
    api: model.api,
    baseUrl: model.baseUrl ?? provider.baseUrl,
    headers: model.headers,
    reasoning: model.reasoning,
    input: model.modalities.input,
    output: model.modalities.output,
    maxTokens: model.limit.output,
    contextSize: model.limit.context,
    quirks: model.quirks,
    env: provider.env,
    providerInfo: provider,
    info: model,
  }
}
