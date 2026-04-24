import type { BuiltinProvider } from "../src/providers/index.ts"
/**
 * Filter the models.dev snapshot, merge our quirks overlay, and emit
 * pre-resolved `ModelOptions` records ready for `getModel` / `loadModel`
 * to consume without any runtime projection.
 *
 * Artifacts:
 *   assets/models.json      — { providers, models } shape:
 *                             - providers: Record<id, ProviderInfo>
 *                             - models:    Record<"<pid>/<mid>", ModelOptions-minus-providerInfo>
 *                             `providerInfo` is attached at lookup time via
 *                             a one-line spread so we don't duplicate
 *                             provider metadata across 2400+ entries.
 *   assets/model-ids.json   — flat sorted array of all ids.
 *
 * Run:  bun packages/ai/scripts/build-providers.ts
 */
import type { ModelInfo, ModelOptions, ProviderInfo, Quirks } from "../src/types.ts"

import { writeFileSync } from "node:fs"
import { join } from "node:path"
import quirksCatalog from "../assets/quirks.json" with { type: "json" }
import snapshot from "../assets/snapshot.json" with { type: "json" }

const AI_DIR = join(import.meta.dirname, "..")
const CATALOG_FILE = join(AI_DIR, "assets", "models.json")
const MODEL_IDS_FILE = join(AI_DIR, "assets", "model-ids.json")

/** Pre-resolved ModelOptions as stored on disk. `providerInfo` is
 *  intentionally absent — it lives in the shared `providers` map to
 *  avoid duplication across entries of the same provider. */
type StoredModelOptions = Omit<ModelOptions, "providerInfo">

/** Provider metadata minus the nested `models` sub-record. We store
 *  models flat under `output.models` so this field would otherwise
 *  duplicate ~1MB of data across the two maps. */
type StoredProviderInfo = Omit<ProviderInfo, "models">

interface Output {
  providers: Record<string, StoredProviderInfo>
  models: Record<string, StoredModelOptions>
}

// ── main ──────────────────────────────────────────────────────────────────

/** Mapping from models.dev `npm` package names to our adapter family.
 *  Single source of truth consulted both at build time (the generator
 *  resolves per-model `provider`) and at runtime (for future adapter
 *  selection if we widen beyond pre-resolved catalog entries).
 *
 *  Returning `undefined` for unknown families means "we don't have an
 *  adapter for this yet" — the generator skips those models instead
 *  of throwing. Add a new entry when a new adapter lands. */
export function adapterForNpm(npm: string): BuiltinProvider | undefined {
  switch (npm) {
    case "@ai-sdk/openai":
    case "@ai-sdk/openai-compatible":
    case "@openrouter/ai-sdk-provider": {
      return "openai"
    }
    // Future: "@ai-sdk/anthropic" → "anthropic", "@ai-sdk/google" → "google".
    default: {
      return undefined
    }
  }
}

const raw = snapshot as unknown as Record<string, ProviderInfo>
const quirksMap = quirksCatalog as Record<
  string,
  { defaults?: Quirks; models?: Record<string, Quirks> }
>

const out: Output = { models: {}, providers: {} }
const allIds: string[] = []
const skipped: { id: string; reason: string }[] = []

for (const [pid, provider] of Object.entries(raw)) {
  // Resolve the provider-level adapter up front. If we don't have one
  // yet, none of its models are emittable — skip the whole provider.
  // Per-model overrides are checked again below.
  const providerAdapter = adapterForNpm(provider.npm)
  if (providerAdapter === undefined) {
    skipped.push({ id: pid, reason: `no adapter for npm ${provider.npm}` })
    continue
  }

  const keptModels: Record<string, ModelInfo> = {}
  for (const [mid, m] of Object.entries(provider.models)) {
    // Effective npm: per-model override wins over provider-level.
    const effectiveNpm = m.provider?.npm ?? provider.npm
    const adapter = adapterForNpm(effectiveNpm)
    if (adapter === undefined) continue // no adapter → skip silently
    if (!m.tool_call) continue
    if (m.status === "deprecated") continue
    keptModels[mid] = m
    out.models[`${pid}/${mid}`] = projectOptions({
      adapter,
      info: m,
      pid,
      provider,
      quirksEntry: quirksMap[pid],
    })
    allIds.push(`${pid}/${mid}`)
  }

  if (Object.keys(keptModels).length === 0) {
    skipped.push({ id: pid, reason: "no tool-calling models survived filter" })
    continue
  }

  // Provider metadata without its `models` sub-record — that lives
  // flattened under `out.models`. Avoids ~1MB of duplication.
  const { models: _, ...providerMeta } = provider
  out.providers[pid] = providerMeta
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

// ── projection ────────────────────────────────────────────────────────────

interface ProjectContext {
  /** Pre-resolved adapter name (e.g. `"openai"`). Baked into the
   *  emitted `ModelOptions.provider` so the runtime never has to
   *  consult the npm mapping again. */
  adapter: BuiltinProvider
  pid: string
  info: ModelInfo
  provider: ProviderInfo
  quirksEntry: { defaults?: Quirks; models?: Record<string, Quirks> } | undefined
}

function projectOptions(ctx: ProjectContext): StoredModelOptions {
  const { adapter, info, pid, provider, quirksEntry } = ctx
  // `ModelInfo.provider` is an override; it lives at a different key
  // in the flattened ModelOptions so the adapter-name identity can
  // take the `provider` slot.
  const { provider: override, ...flatInfo } = info

  const quirks = mergeQuirks(quirksEntry?.defaults, quirksEntry?.models?.[info.id])
  const baseUrl = override?.api ?? provider.api
  const headers = providerHeaders(pid)

  const opts: StoredModelOptions = {
    ...flatInfo,
    maxTokens: info.limit.output,
    provider: adapter,
  }
  if (override !== undefined) opts.providerOverride = override
  if (baseUrl !== undefined) opts.baseUrl = baseUrl
  if (headers !== undefined) opts.headers = headers
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

/** Per-provider header overrides. Hard-coded for now — if the list
 *  grows we move it to a `headers.json` alongside `quirks.json`. */
function providerHeaders(pid: string): Record<string, string> | undefined {
  if (pid === "openrouter") return { "HTTP-Referer": "https://zaly.sh", "X-Title": "Zaly" }
  return undefined
}
