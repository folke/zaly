/**
 * Fetch the models.dev catalog, snapshot it to `assets/models.json`,
 * and print stats so we can decide on chunking / size trade-offs.
 *
 * Run:  bun packages/ai/scripts/fetch-models.ts
 */
import { gzipSync } from "node:zlib"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CATALOG_URL = "https://models.dev/api.json"
const OUT_DIR = join(import.meta.dirname, "..", "assets")
// Raw snapshot — unfiltered. `build-providers.ts` filters this down
// into the runtime-consumed `assets/models.json`.
const OUT_FILE = join(OUT_DIR, "snapshot.json")

interface Provider {
  id: string
  name: string
  env: string[]
  npm: string
  api?: string
  doc: string
  models: Record<string, ModelMeta>
}

interface ModelMeta {
  id: string
  name: string
  reasoning: boolean
  tool_call: boolean
  attachment: boolean
  modalities: { input: string[]; output: string[] }
  limit: { context: number; input?: number; output: number }
  cost?: Record<string, number | Record<string, number>>
  provider?: { shape?: "completions" | "responses" }
  status?: string
}

console.log(`→ GET ${CATALOG_URL}`)
const t0 = performance.now()
const res = await fetch(CATALOG_URL)
if (!res.ok) {
  console.error(`✖ ${res.status} ${res.statusText}`)
  process.exit(1)
}
const raw = await res.text()
const ms = Math.round(performance.now() - t0)
console.log(`✓ ${(raw.length / 1024).toFixed(1)} KB in ${ms}ms\n`)

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT_FILE, raw)
console.log(`→ wrote ${OUT_FILE}`)

// ── stats ────────────────────────────────────────────────────────────────

const catalog: Record<string, Provider> = JSON.parse(raw)
const providers = Object.values(catalog)
const allModels: (ModelMeta & { providerId: string })[] = []
for (const p of providers) {
  for (const m of Object.values(p.models)) allModels.push(Object.assign(m, { providerId: p.id }))
}

const gzipped = gzipSync(Buffer.from(raw)).length

console.log()
console.log("── size ─────────────────────────────────────────────────────")
console.log(`  raw JSON:    ${(raw.length / 1024).toFixed(1)} KB`)
console.log(`  gzipped:     ${(gzipped / 1024).toFixed(1)} KB`)
console.log(`  providers:   ${providers.length}`)
console.log(`  models:      ${allModels.length}`)
console.log(`  avg bytes/model (raw):  ${Math.round(raw.length / allModels.length)}`)

console.log()
console.log("── adapter families (by npm) ────────────────────────────────")
const byNpm = new Map<string, number>()
for (const p of providers) byNpm.set(p.npm, (byNpm.get(p.npm) ?? 0) + 1)
for (const [npm, count] of [...byNpm.entries()].toSorted((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(3)}  ${npm}`)
}

console.log()
console.log("── providers per adapter we support (openai family) ─────────")
const OPENAI_FAMILY = new Set([
  "@ai-sdk/openai",
  "@ai-sdk/openai-compatible",
  "@openrouter/ai-sdk-provider",
])
const ANTHROPIC_FAMILY = new Set(["@ai-sdk/anthropic"])
const supported = providers.filter((p) => OPENAI_FAMILY.has(p.npm) || ANTHROPIC_FAMILY.has(p.npm))
const skipped = providers.filter(
  (p) => !OPENAI_FAMILY.has(p.npm) && !ANTHROPIC_FAMILY.has(p.npm)
)
const supportedModels = supported.reduce((n, p) => n + Object.keys(p.models).length, 0)
console.log(`  supported:   ${supported.length} providers · ${supportedModels} models`)
console.log(`  skipped:     ${skipped.length} providers · ${skipped.map((p) => p.id).join(", ")}`)

console.log()
console.log("── per-provider sizes (models count + slice bytes) ──────────")
const rows = providers
  .map((p) => {
    const slice = JSON.stringify(p.models)
    return {
      count: Object.keys(p.models).length,
      id: p.id,
      kb: slice.length / 1024,
      npm: p.npm,
    }
  })
  .toSorted((a, b) => b.kb - a.kb)
for (const r of rows) {
  console.log(
    `  ${r.id.padEnd(28)}  ${r.count.toString().padStart(3)} models  ${r.kb.toFixed(1).padStart(6)} KB  ${r.npm}`
  )
}

console.log()
console.log("── feature coverage ─────────────────────────────────────────")
const reasoning = allModels.filter((m) => m.reasoning).length
const toolCall = allModels.filter((m) => m.tool_call).length
const multimodal = allModels.filter((m) =>
  m.modalities.input.some((x) => x !== "text")
).length
const responsesShape = allModels.filter((m) => m.provider?.shape === "responses").length
console.log(`  reasoning:        ${reasoning} / ${allModels.length}`)
console.log(`  tool_call:        ${toolCall} / ${allModels.length}`)
console.log(`  multimodal input: ${multimodal} / ${allModels.length}`)
console.log(`  "responses" API:  ${responsesShape} / ${allModels.length}`)
