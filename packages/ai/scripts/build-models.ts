/**
 * Filter the models.dev snapshot, apply our overrides, and emit
 * pre-resolved `ModelOptions` records ready for `getModel` / `loadModel`
 * to consume without any runtime projection.
 *
 * Artifacts:
 *   assets/models.json      — { providers, models } shape:
 *                             - providers: Record<id, ProviderInfo-minus-models>
 *                             - models:    Record<"<pid>/<mid>", ModelOptions-minus-providerInfo>
 *                             `providerInfo` is attached at lookup time via
 *                             a one-line spread so we don't duplicate
 *                             provider metadata across 2400+ entries.
 *   assets/model-ids.json   — flat sorted array of all ids.
 *
 * Run:  bun packages/ai/scripts/build-providers.ts
 */
import type { BuiltinProvider } from "../src/providers/index.ts"
import type { ModelInfo, ModelSpec, ProviderInfo, Quirks } from "../src/types.ts"
import type { ProviderOverride } from "./overrides.ts"

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import snapshot from "../assets/snapshot.json" with { type: "json" }
import { overrides } from "./overrides.ts"

const AI_DIR = join(import.meta.dirname, "..")
const CATALOG_FILE = join(AI_DIR, "assets", "models.json")
const MODEL_IDS_FILE = join(AI_DIR, "assets", "model-ids.json")

/** Pre-resolved ModelOptions as stored on disk. `providerInfo` is
 *  intentionally absent — it lives in the shared `providers` map to
 *  avoid duplication across entries of the same provider. */
type StoredModelOptions = Omit<ModelSpec, "providerInfo">

/** Provider metadata minus the nested `models` sub-record. We store
 *  models flat under `output.models` so this field would otherwise
 *  duplicate ~1MB of data across the two maps. */
type StoredProviderInfo = Omit<ProviderInfo, "models">

interface Output {
  providers: Record<string, StoredProviderInfo>
  models: Record<string, StoredModelOptions>
}

// ── npm → adapter mapping ─────────────────────────────────────────────────
//
// Which models.dev `npm` classifications can we actually serve today.
// A provider-level `adapter` override in `overrides.ts` takes priority
// over this mapping — that's how google / xai / mistral etc. get
// routed through our openai adapter via their compat endpoints even
// though the catalog classifies them differently.

function adapterForNpm(npm: string): BuiltinProvider | undefined {
  switch (npm) {
    // The official OpenAI SDK speaks Responses; the OpenAI-compatible
    // family (and OpenRouter) only speak Chat Completions. Matches pi's
    // routing — see pi-mono/packages/ai/scripts/generate-models.ts.
    case "@ai-sdk/openai": {
      return "openai-responses"
    }
    case "@ai-sdk/openai-compatible":
    case "@openrouter/ai-sdk-provider": {
      return "openai"
    }
    case "@ai-sdk/anthropic": {
      return "anthropic"
    }
    default: {
      return undefined
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────

const raw = snapshot as unknown as Record<string, ProviderInfo>

const out: Output = { models: {}, providers: {} }
const allIds: string[] = []
const skipped: { id: string; reason: string }[] = []

for (const [pid, provider] of Object.entries(raw)) {
  const override = overrides[pid] ?? {}
  const adapter = resolveAdapter(provider, override)
  if (adapter === undefined) {
    skipped.push({ id: pid, reason: `no adapter for npm ${provider.npm}` })
    continue
  }

  const keptModels: Record<string, ModelInfo> = {}
  for (const [mid, m] of Object.entries(provider.models)) {
    if (!m.tool_call) continue
    if (m.status === "deprecated") continue

    // Per-model effective adapter. Model-level npm override wins over
    // provider-level (but not over our `overrides.adapter` force).
    const modelAdapter = override.adapter ?? adapterForNpm(m.provider?.npm ?? provider.npm)
    if (modelAdapter === undefined) continue

    // Escape-hatch transform: can drop or rewrite arbitrary fields.
    const info = override.transform ? override.transform(m, provider) : m
    if (info === undefined) continue

    keptModels[mid] = info
    out.models[`${pid}/${mid}`] = projectOptions({
      adapter: modelAdapter,
      info,
      override,
      provider,
    })
    allIds.push(`${pid}/${mid}`)
  }

  if (Object.keys(keptModels).length === 0) {
    skipped.push({ id: pid, reason: "no tool-calling models survived filter" })
    continue
  }

  out.providers[pid] = toStoredProviderInfo(provider, override)
}

allIds.sort((a, b) => a.localeCompare(b))

writeFileSync(CATALOG_FILE, `${JSON.stringify(out, undefined, 2)}\n`)
writeFileSync(MODEL_IDS_FILE, `${JSON.stringify(allIds, undefined, 2)}\n`)

const providerCount = Object.keys(out.providers).length
console.log(`✓ ${providerCount} providers, ${allIds.length} models`)
console.log(`  wrote: ${CATALOG_FILE.replace(AI_DIR, ".")}`)
console.log(`         ${MODEL_IDS_FILE.replace(AI_DIR, ".")}`)
console.log()
console.log(`skipped (${skipped.length}):`)
for (const s of skipped) console.log(`  ${s.id.padEnd(30)}  ${s.reason}`)

// ── helpers ───────────────────────────────────────────────────────────────

/** Pick the adapter family for a provider. Provider-level override
 *  (`overrides.ts`) wins; otherwise fall back to the npm mapping. */
function resolveAdapter(
  provider: ProviderInfo,
  override: ProviderOverride
): BuiltinProvider | undefined {
  if (override.adapter !== undefined) return override.adapter
  return adapterForNpm(provider.npm)
}

/** Strip the `models` sub-record from ProviderInfo (stored flat
 *  elsewhere) and apply any baseUrl override. Other fields pass
 *  through unchanged. */
function toStoredProviderInfo(
  provider: ProviderInfo,
  override: ProviderOverride
): StoredProviderInfo {
  const { models: _, ...rest } = provider
  if (override.baseUrl !== undefined) rest.api = override.baseUrl
  return rest
}

interface ProjectContext {
  adapter: BuiltinProvider
  info: ModelInfo
  provider: ProviderInfo
  override: ProviderOverride
}

function projectOptions(ctx: ProjectContext): StoredModelOptions {
  const { adapter, info, override, provider } = ctx
  // `ModelInfo.provider` is a per-model override; it lives at a
  // different key in the flattened ModelOptions so the adapter-name
  // identity can take the `provider` slot.
  const { provider: modelOverride, ...flatInfo } = info

  const quirks = mergeQuirks(override.quirks, override.modelQuirks?.[info.id])
  // baseUrl precedence: per-model override (rare) > overrides.ts > provider.api.
  const baseUrl = modelOverride?.api ?? override.baseUrl ?? provider.api

  const opts: StoredModelOptions = {
    ...flatInfo,
    maxTokens: info.limit.output,
    provider: adapter,
  }
  if (modelOverride !== undefined) opts.providerOverride = modelOverride
  if (baseUrl !== undefined) opts.baseUrl = baseUrl
  if (override.headers !== undefined) opts.headers = override.headers
  if (quirks !== undefined) opts.quirks = quirks
  return opts
}

function mergeQuirks(
  defaults: Quirks | undefined,
  override: Quirks | undefined
): Quirks | undefined {
  if (defaults === undefined && override === undefined) return undefined
  return { ...defaults, ...override }
}
