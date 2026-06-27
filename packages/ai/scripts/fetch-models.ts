import type { ModelInfo } from "../src/types.ts"

import { formatSize } from "@zaly/shared"
import { readFileSync } from "node:fs"
import { join } from "node:path"
/**
 * Fetch the models.dev catalog, snapshot it to `assets/models.json`,
 * and print stats so we can decide on chunking / size trade-offs.
 *
 * Run:  bun packages/ai/scripts/fetch-models.ts
 */
import { gzipSync } from "node:zlib"
import { downloadCatalog } from "../src/models/catalog.ts"

const OUT_DIR = join(import.meta.dirname, "..", "assets")

const t0 = performance.now()
const ms = Math.round(performance.now() - t0)
const catalog = await downloadCatalog(OUT_DIR)
const raw = readFileSync(join(OUT_DIR, "snapshot.json"), "utf8")
const cleaned = readFileSync(join(OUT_DIR, "models.json"), "utf8")
console.log(`✓ ${formatSize(raw.length)} in ${ms}ms\n`)
console.log(`→ supported providers/models: ${formatSize(cleaned.length)}`)

// ── stats ────────────────────────────────────────────────────────────────

const providers = Object.values(catalog.$).filter((p) => !!p)
const allModels: (ModelInfo & { providerId: string })[] = []
for (const p of providers) {
  for (const m of Object.values(p.models)) allModels.push(Object.assign(m, { providerId: p.id }))
}

const gzipped = gzipSync(Buffer.from(cleaned)).length

console.log()
console.log("── size ─────────────────────────────────────────────────────")
console.log(`  raw JSON:     ${formatSize(raw.length)}`)
console.log(`  cleaned JSON: ${formatSize(cleaned.length)}`)
console.log(`  gzipped:      ${formatSize(gzipped)}`)
console.log(`  providers:    ${providers.length}`)
console.log(`  models:       ${allModels.length}`)
console.log(`  avg bytes/model (raw):  ${Math.round(cleaned.length / allModels.length)}`)

console.log()
console.log("── adapter families (by npm) ────────────────────────────────")
const byNpm = new Map<string, number>()
for (const p of providers) byNpm.set(p.npm, (byNpm.get(p.npm) ?? 0) + 1)
for (const [npm, count] of [...byNpm.entries()].toSorted((a, b) => b[1] - a[1])) {
  console.log(`  ${count.toString().padStart(3)}  ${npm}`)
}

console.log()
console.log("── providers per adapter we support (openai family) ─────────")
const supported = providers.filter((p) => catalog.provider(p.id))
const skipped = providers.filter((p) => !catalog.provider(p.id))
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
for (const r of rows.slice(0, 10)) {
  console.log(
    `  ${r.id.padEnd(28)}  ${r.count.toString().padStart(3)} models  ${r.kb.toFixed(1).padStart(6)} KB  ${r.npm}`
  )
}

console.log()
console.log("── feature coverage ─────────────────────────────────────────")
const reasoning = allModels.filter((m) => m.reasoning).length
const toolCall = allModels.filter((m) => m.tool_call).length
const multimodal = allModels.filter((m) => m.modalities.input.some((x) => x !== "text")).length
const responsesShape = allModels.filter((m) => m.provider?.shape === "responses").length
console.log(`  reasoning:        ${reasoning} / ${allModels.length}`)
console.log(`  tool_call:        ${toolCall} / ${allModels.length}`)
console.log(`  multimodal input: ${multimodal} / ${allModels.length}`)
console.log(`  "responses" API:  ${responsesShape} / ${allModels.length}`)
