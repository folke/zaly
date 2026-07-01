import type { Modality, ModelSpec } from "../types.ts"

import { AuthManager } from "../auth/manager.ts"

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
export type ModelFilter = {
  auth?: AuthManager | true
  reasoning?: boolean
  contextSize?: number
  modality?:
    | Modality
    | Modality[]
    | { input?: Modality | Modality[]; output?: Modality | Modality[] }
  filter?: string | ((m: ModelSpec) => boolean)
}

export async function filterModel(m: ModelSpec, opts?: ModelFilter): Promise<boolean> {
  const auth = opts?.auth === true ? AuthManager.basic() : opts?.auth
  if (auth?.needAuth(m.provider) && !(await auth.getAuth(m))) return false
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
  models: readonly ModelSpec[],
  opts?: ModelFilter
): Promise<ModelSpec[]> {
  models = models.toSorted((a, b) => {
    const ap = a.provider.name
    const bp = b.provider.name
    if (ap && bp && ap !== bp) return ap.localeCompare(bp)
    const ka = a.release_date ?? a.last_updated ?? a.id
    const kb = b.release_date ?? b.last_updated ?? b.id
    if (ka !== kb) return -ka.localeCompare(kb)
    return a.name.localeCompare(b.name)
  })

  // PERF: resolve to basic auth once, not per model.
  if (opts?.auth === true) opts = { ...opts, auth: AuthManager.basic() }

  // Run filters in parallel — `auth.getAuth` may be async (OAuth,
  // keychain); sequential await would serialise 2400 lookups.
  const verdicts = await Promise.all(models.map((m) => filterModel(m, opts)))
  const out: ModelSpec[] = []
  for (const [i, m] of models.entries()) if (verdicts[i]) out.push(m)
  return out
}
