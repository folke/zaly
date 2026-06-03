/** Natural sort: alphabetic chunks ascending, numeric chunks descending.
 *  Splits on digit/non-digit boundaries so `claude-sonnet-4-6` lands
 *  before `claude-sonnet-3-5` (newer first within the same family) while
 *  `anthropic/...` still sorts before `openai/...` alphabetically. */
export function compareNaturalDescNumbers(a: string, b: string): number {
  // Capture decimals as one chunk so `5.5` compares as 5.5, not as
  // `5` + `.` + `5` (which would tie with `5` on the leading digit and
  // then lose to it on length).
  const re = /(?<num>\d+(?:\.\d+)?)/g
  const ax = a.split(re)
  const bx = b.split(re)
  const len = Math.min(ax.length, bx.length)
  for (let i = 0; i < len; i++) {
    const ap = ax[i]
    const bp = bx[i]
    if (/^\d+(?:\.\d+)?$/.test(ap) && /^\d+(?:\.\d+)?$/.test(bp)) {
      const cmp = Number(bp) - Number(ap)
      if (cmp !== 0) return cmp
    } else {
      const cmp = ap.localeCompare(bp)
      if (cmp !== 0) return cmp
    }
  }
  return ax.length - bx.length
}
