import type { ModelOptions, ProviderInfo } from "./types.ts"

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

/** On-disk catalog shape emitted by `scripts/build-providers.ts`. */
interface Catalog {
  providers: Record<string, Omit<ProviderInfo, "models">>
  models: Record<string, Omit<ModelOptions, "providerInfo">>
}

let catalogPromise: Promise<Catalog> | undefined

function loadCatalog(): Promise<Catalog> {
  catalogPromise ??= import("../assets/models.json", { with: { type: "json" } }).then(
    (m) => m.default as unknown as Catalog
  )
  return catalogPromise
}

// ── Runtime-registered custom catalog ───────────────────────────────────

const customModels = new Map<string, ModelOptions>()

/** Register custom model entries. Overrides any existing entry with
 *  the same id (custom or built-in). Persists for the lifetime of
 *  the process — nothing is written to disk. */
export function addModels(models: Record<string, ModelOptions>): void {
  for (const [id, opts] of Object.entries(models)) customModels.set(id, opts)
}

/** Look up model options by id. Custom models win over built-ins.
 *  Built-in entries come pre-resolved from the generator — quirks,
 *  baseUrl, headers, maxTokens are all baked in; we just attach
 *  `providerInfo` from the shared providers map. */
export async function getModel(id: string): Promise<ModelOptions | undefined> {
  const custom = customModels.get(id)
  if (custom !== undefined) return custom
  return await resolveBuiltin(id)
}

/** Every model we know about, keyed by id. Includes runtime-registered
 *  custom models. For just ids (autocomplete sources), use
 *  `listModelIds` — one compact JSON, no catalog load needed. */
export async function listModels(): Promise<Record<string, ModelOptions>> {
  const catalog = await loadCatalog()
  const out: Record<string, ModelOptions> = {}
  for (const [id, stored] of Object.entries(catalog.models)) {
    out[id] = attachProviderInfo(stored, catalog, id)
  }
  for (const [id, opts] of customModels) out[id] = opts
  return out
}

/** Flat sorted array of every built-in model id. Custom models are
 *  NOT included — this is a pre-generated compact payload for TUI
 *  autocomplete sources. For custom ids too, walk `listModels`. */
export async function listModelIds(): Promise<readonly string[]> {
  const mod = await import("../assets/model-ids.json", { with: { type: "json" } })
  return mod.default
}

/** Built-in providers map. Exposed so callers can read endpoint
 *  metadata directly (names, docs URLs, env-var names) for pickers
 *  or admin tooling. */
export async function builtinProviders(): Promise<Readonly<Record<string, Omit<ProviderInfo, "models">>>> {
  const catalog = await loadCatalog()
  return catalog.providers
}

async function resolveBuiltin(id: string): Promise<ModelOptions | undefined> {
  const catalog = await loadCatalog()
  const stored = (catalog.models as Record<string, Catalog["models"][string] | undefined>)[id]
  if (stored === undefined) return undefined
  return attachProviderInfo(stored, catalog, id)
}

/** Attach `providerInfo` to a stored `ModelOptions`. The endpoint id
 *  (the URI prefix — `"openrouter"`, `"deepseek"`, …) comes from the
 *  model id key; `stored.provider` is now the adapter name, which
 *  isn't what we need to look up provider metadata. */
function attachProviderInfo(
  stored: Catalog["models"][string],
  catalog: Catalog,
  id: string
): ModelOptions {
  const { provider: endpointId } = parseModelId(id)
  const providerMeta = (catalog.providers as Record<string, Catalog["providers"][string] | undefined>)[
    endpointId
  ]
  if (providerMeta === undefined) return stored
  return { ...stored, providerInfo: { ...providerMeta, models: {} } }
}
