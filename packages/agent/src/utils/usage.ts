import type { Message, TokenCount, Usage } from "@zaly/ai"

/** Sum two Usages. Optional fields are only present in the result
 *  when at least one input had them set, so callers can tell "no
 *  reasoning happened this turn" apart from "0 reasoning tokens." */
export function addUsage(a: Usage, b: Usage): Usage {
  const out: Usage = {
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
  if (a.cost || b.cost) out.cost = addUsage(a.cost ?? empty(), b.cost ?? empty())
  return out
}

export class TokenUsage {
  #last: Usage
  #total: Usage = empty()

  constructor(messages?: readonly Message[]) {
    this.#last = lastTokenUsage(messages ?? []) ?? empty()
  }

  add(count: Usage): void {
    this.#last = count
    this.#total = addUsage(this.#total, count)
  }

  resetLast(): void {
    this.#last = empty()
  }

  get last(): Usage {
    return this.#last
  }

  get total(): Usage {
    return this.#total
  }

  get contextSize(): number {
    return (
      this.last.input + this.last.output + (this.last.cacheRead ?? 0) + (this.last.cacheWrite ?? 0)
    )
  }
}

function empty(): TokenCount {
  return { input: 0, output: 0 }
}

export function lastTokenUsage(messages: readonly Message[]): Usage | undefined {
  const message = messages.findLast((m) => m.role === "assistant" && m.meta?.usage) as
    | Message<"assistant">
    | undefined
  return message?.meta?.usage
}
