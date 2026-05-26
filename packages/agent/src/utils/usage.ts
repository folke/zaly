import type { TokenCount } from "@zaly/ai"

/** Sum two TokenCounts. Optional fields are only present in the result
 *  when at least one input had them set, so callers can tell "no
 *  reasoning happened this turn" apart from "0 reasoning tokens." */
export function addUsage(a: TokenCount, b: TokenCount): TokenCount {
  const out: TokenCount = {
    input: a.input + b.input,
    output: a.output + b.output,
  }
  if (a.cacheRead !== undefined || b.cacheRead !== undefined) {
    out.cacheRead = (a.cacheRead ?? 0) + (b.cacheRead ?? 0)
  }
  if (a.cacheWrite !== undefined || b.cacheWrite !== undefined) {
    out.cacheWrite = (a.cacheWrite ?? 0) + (b.cacheWrite ?? 0)
  }
  if (a.reasoning !== undefined || b.reasoning !== undefined) {
    out.reasoning = (a.reasoning ?? 0) + (b.reasoning ?? 0)
  }
  return out
}

export class TokenUsage {
  #last: TokenCount = { input: 0, output: 0 }
  #total: TokenCount = { input: 0, output: 0 }

  add(count: TokenCount): void {
    this.#last = count
    this.#total = addUsage(this.#total, count)
  }

  resetLast(): void {
    this.#last = { input: 0, output: 0 }
  }

  get last(): TokenCount {
    return this.#last
  }

  get total(): TokenCount {
    return this.#total
  }

  get contextSize(): number {
    return (
      this.last.input + this.last.output + (this.last.cacheRead ?? 0) + (this.last.cacheWrite ?? 0)
    )
  }
}
