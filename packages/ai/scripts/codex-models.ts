import { readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"
import { parseArgs } from "node:util"

const GITHUB_MODELS =
  "https://raw.githubusercontent.com/openai/codex/main/codex-rs/models-manager/models.json"

type CodexSourceOptions = { source: "local" | "github"; cachePath?: string }

export function codexModelArgs(args: string[]): CodexSourceOptions {
  const { values } = parseArgs({
    args,
    options: { source: { type: "string" }, cache: { type: "string" } },
  })
  if (values.source !== "local" && values.source !== "github") {
    throw new Error("Choose a source explicitly: --source local|github")
  }
  if (values.cache && values.source !== "local")
    throw new Error("--cache is only valid with --source local")
  return { source: values.source, cachePath: values.cache }
}

/** Extract context windows from either the Codex CLI cache or GitHub's model metadata. */
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
  opts: CodexSourceOptions,
  targetPath = resolve(import.meta.dirname, "../src/models/overrides.ts")
): Promise<void> {
  let data: unknown
  if (opts.source === "github") {
    const response = await fetch(GITHUB_MODELS, { signal: AbortSignal.timeout(30_000) })
    if (!response.ok)
      throw new Error(`Failed to fetch Codex models: ${response.status} ${response.statusText}`)
    data = await response.json()
  } else {
    const cachePath = opts.cachePath ?? resolve(homedir(), ".codex/models_cache.json")
    data = JSON.parse(await readFile(cachePath, "utf8"))
  }
  const models = codexModels(data)
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

if (import.meta.main) await generateCodexModels(codexModelArgs(process.argv.slice(2)))
