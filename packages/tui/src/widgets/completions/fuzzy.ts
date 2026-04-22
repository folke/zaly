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
 *   - a match at index 0 gets a prefix bonus so "wid" ranks "widget.ts"
 *     above "some-widget.ts"
 *   - case-insensitive throughout
 */
export function fuzzyScore(query: string, target: string): number {
  if (query === "") return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  let score = 0
  let run = 0
  let firstMatch = -1
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (firstMatch === -1) firstMatch = ti
      run++
      // Base point + run bonus (grows so long runs pull ahead).
      score += 1 + run * run
      qi++
    } else {
      run = 0
    }
  }
  if (qi < q.length) return 0
  if (firstMatch === 0) score += 10
  return score
}
