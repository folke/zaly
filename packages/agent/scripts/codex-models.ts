import { readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"

/** Refresh the Codex CLI cache with `/models`, then run this script from any directory. */
export function codexModels(cache: unknown): Record<string, number> {
  if (!cache || typeof cache !== "object" || !("models" in cache) || !Array.isArray(cache.models)) {
    throw new Error("Invalid Codex model cache: expected a models array")
  }
  const models = new Map<string, number>()
  for (const model of cache.models) {
    if (
      !model ||
      typeof model !== "object" ||
      typeof model.slug !== "string" ||
      !model.slug.trim() ||
      !Number.isSafeInteger(model.context_window) ||
      model.context_window <= 0
    ) {
      throw new Error(
        "Invalid Codex model cache: models need a slug and positive integer context_window"
      )
    }
    if (models.has(model.slug) && models.get(model.slug) !== model.context_window) {
      throw new Error(`Conflicting context windows for ${model.slug}`)
    }
    models.set(model.slug, model.context_window)
  }
  if (!models.size) throw new Error("Codex model cache contains no models")
  return Object.fromEntries([...models].toSorted(([a], [b]) => a.localeCompare(b)))
}

export async function generateCodexModels(
  cachePath = resolve(homedir(), ".codex/models_cache.json"),
  targetPath = resolve(import.meta.dirname, "../../ai/src/models/overrides.ts")
): Promise<void> {
  const models = codexModels(JSON.parse(await readFile(cachePath, "utf8")))
  const source = await readFile(targetPath, "utf8")
  const start = "// start:codex-models"
  const end = "// end:codex-models"
  const before = source.indexOf(start)
  const after = source.indexOf(end)
  if (
    before === -1 ||
    after < before ||
    source.includes(start, before + start.length) ||
    source.includes(end, after + end.length)
  ) {
    throw new Error(`Expected exactly one ${start} / ${end} region in ${targetPath}`)
  }
  const entries = Object.entries(models)
    .map(
      ([name, context]) =>
        `  ${JSON.stringify(name)}: ${context.toLocaleString("en-US").replaceAll(",", "_")},`
    )
    .join("\n")
  const region = `${start}\nconst codexModels: Record<string, number> = {\n${entries}\n}\n${end}`
  const updated = source.slice(0, before) + region + source.slice(after + end.length)
  if (updated !== source) await writeFile(targetPath, updated)
}

if (import.meta.main) await generateCodexModels(process.argv[2])
