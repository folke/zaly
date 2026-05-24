/**
 * Sort `items` by a scoring function, filter out zeros, optionally cap
 * the result. Handy when a completion source wants `match`-driven
 * ranking — the default filter behaviour preserves source order, so
 * callers reach for `rank()` explicitly.
 *
 * ```ts
 * complete: (q, match) => rank(entries, e => match(e.name), 50)
 * ```
 */
export function rank<T>(items: Iterable<T>, score: (item: T) => number, limit?: number): T[] {
  const ranked: { item: T; score: number }[] = []
  for (const item of items) {
    const s = score(item)
    if (s > 0) ranked.push({ item, score: s })
  }
  ranked.sort((a, b) => b.score - a.score)
  const out = ranked.map((r) => r.item)
  return limit === undefined ? out : out.slice(0, limit)
}

/**
 * Subsequence-match score. Returns `0` when `query` isn't a subsequence
 * of `target` (case-insensitive), otherwise a positive integer — higher
 * is better. Empty queries score `1` so unfiltered lists come through.
 *
 * Scoring is simple and deliberately cheap:
 *   - each matched char contributes 1
 *   - consecutive matches add a run bonus (grows quadratically inside
 *     the run) so "abc" in "abcxyz" beats "a-b-c"
 *   - earlier matches score higher, not just exact prefixes
 *   - matches at path / word boundaries get a bonus
 *   - exact substrings get an extra early-match bonus
 *   - shorter targets get a small tie-break bonus
 *   - case-insensitive throughout
 */
export function fuzzyScore(query: string, target: string): number {
  query = query.trim()
  if (query === "") return 1

  const parts = query.split(/\s+/).filter((p) => p !== "")
  if (parts.length > 1) {
    let ret = 0
    for (const part of parts) {
      const s = fuzzyScore(part, target)
      if (s === 0) return 0
      ret += s
    }
    return ret
  }

  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let score = 0
  let run = 0
  let firstMatch = -1

  const exact = t.indexOf(q)
  if (exact !== -1) score += 50 / (exact + 1)

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) {
      run = 0
      continue
    }

    if (firstMatch === -1) firstMatch = ti
    run++
    score += 1 + run * run
    score += 20 / (ti + 1)
    if (isBoundary(t, ti)) score += 8
    qi++
  }
  if (qi < q.length) return 0

  score += 30 / (firstMatch + 1)
  score += Math.max(0, 10 - (target.length - query.length) / 4)
  return score
}

function isBoundary(target: string, index: number): boolean {
  return index === 0 || /[/_.\-\s]/.test(target[index - 1])
}
