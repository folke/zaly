import type { ScoreOptions } from "./score.ts"

import { Score } from "./score.ts"

export type SearchItem = {
  idx?: number
  score?: number
  text: string
}

export type ScoredItem<T extends SearchItem = SearchItem> = T & {
  score: number
  idx: number
}

export type MatcherOptions = ScoreOptions & {
  fuzzy?: boolean
  ignorecase?: boolean
  regex?: boolean
  smartcase?: boolean
}

type Mod = {
  chars: string[]
  entropy: number
  exactPrefix?: boolean
  exactSuffix?: boolean
  field?: string
  fuzzy?: boolean
  ignorecase?: boolean
  inverse?: boolean
  pattern: string
  re?: RegExp
  regex?: boolean
  word?: boolean
}

type Match = {
  from: number
  score: number
  search: string
  str: string
  to: number
}

export class Matcher<T extends SearchItem = SearchItem> {
  readonly opts: Required<Pick<MatcherOptions, "fuzzy" | "ignorecase" | "smartcase">> &
    MatcherOptions
  readonly score: Score
  mods: Mod[][] = []
  one: Mod | undefined
  pattern = ""
  tick = 0

  constructor(opts: MatcherOptions = {}) {
    this.opts = {
      fuzzy: true,
      ignorecase: true,
      smartcase: true,
      ...opts,
    }
    this.score = new Score(opts)
  }

  empty(): boolean {
    return this.mods.length === 0
  }

  init(pattern: string): boolean {
    pattern = pattern.trim()
    if (pattern === this.pattern) return false

    this.pattern = pattern
    this.tick++
    this.mods = []
    this.one = undefined
    if (pattern === "") return true

    if (this.opts.regex) {
      this.mods = [[this.#prepare(pattern)]]
    } else {
      let isOr = false
      for (const part of pattern.split(/ +/)) {
        if (part === "|") {
          isOr = true
          continue
        }
        const mod = this.#prepare(part)
        if (mod.pattern === "") continue
        if (isOr && this.mods.length > 0) this.mods.at(-1)?.push(mod)
        else this.mods.push([mod])
        isOr = false
      }
    }

    this.mods = this.mods.map((ors) => ors.toSorted((a, b) => a.entropy - b.entropy))
    this.mods = this.mods.toSorted((a, b) => (b[0]?.entropy ?? 0) - (a[0]?.entropy ?? 0))
    if (this.mods.length === 1 && this.mods[0]?.length === 1) this.one = this.mods[0][0]
    return true
  }

  match(input: T | string): number {
    if (this.empty()) return 1000
    const item = typeof input === "string" ? { text: input } : input
    if (this.one) return this.#match(item, this.one)?.score ?? 0

    let score = 0
    for (const any of this.mods) {
      let match: Match | undefined
      for (const mod of any) {
        match = this.#match(item, mod)
        if (match) break
      }
      if (!match) return 0
      score += match.score
    }
    return score
  }

  update(item: T): ScoredItem<T> {
    const score = this.match(item)
    item.score = score
    return item as ScoredItem<T>
  }

  positions(input: T | string): number[] {
    if (this.empty()) return []
    const item = typeof input === "string" ? { text: input } : input
    const ret: number[] = []
    const all = this.mods.flat()
    for (const mod of all) {
      const match = this.#match(item, mod)
      if (!match) continue
      if (mod.fuzzy) ret.push(...this.#fuzzyPositions(match.search, mod.chars, match.from))
      else for (let i = match.from; i <= match.to; i++) ret.push(i)
    }
    return [...new Set(ret)].toSorted((a, b) => a - b)
  }

  fields(): string[] {
    const ret = new Set<string>()
    for (const mod of this.mods.flat()) ret.add(mod.field ?? "text")
    return [...ret]
  }

  #prepare(pattern: string): Mod {
    const mod: Mod = { chars: [], entropy: 0, pattern }

    if (this.opts.regex) {
      mod.regex = true
      const isLower = mod.pattern.toLowerCase() === mod.pattern
      mod.ignorecase = this.opts.smartcase ? isLower : this.opts.ignorecase
      try {
        mod.re = new RegExp(mod.pattern, mod.ignorecase ? "i" : undefined)
      } catch {
        mod.re = undefined
      }
    } else {
      const file = parseFilePattern(pattern)
      if (file) {
        mod.field = "file"
        mod.pattern = `${file}$`
      }

      const field = mod.pattern.match(/^([\w_][\w_]+):(.*)$/)
      if (field) {
        mod.field = field[1]
        mod.pattern = field[2]
      }

      mod.ignorecase = this.opts.ignorecase
      const isLower = mod.pattern.toLowerCase() === mod.pattern
      if (this.opts.smartcase) mod.ignorecase = isLower
      mod.fuzzy = this.opts.fuzzy
      if (!mod.fuzzy) mod.entropy += 10

      if (mod.pattern.startsWith("!")) {
        mod.fuzzy = false
        mod.inverse = true
        mod.pattern = mod.pattern.slice(1)
        mod.entropy -= 1
      }
      if (mod.pattern.startsWith("'")) {
        mod.fuzzy = false
        mod.pattern = mod.pattern.slice(1)
        mod.entropy += 10
        if (mod.pattern.endsWith("'")) {
          mod.word = true
          mod.pattern = mod.pattern.slice(0, -1)
          mod.entropy += 10
        }
      } else if (mod.pattern.startsWith("^")) {
        mod.fuzzy = false
        mod.exactPrefix = true
        mod.pattern = mod.pattern.slice(1)
        mod.entropy += 20
      }
      if (mod.pattern.endsWith("$")) {
        mod.fuzzy = false
        mod.exactSuffix = true
        mod.pattern = mod.pattern.slice(0, -1)
        mod.entropy += 20
      }

      const rareChars = (mod.pattern.match(/[^\w\s]/g) ?? []).length
      mod.entropy += Math.min(mod.pattern.length, 20) + rareChars * 2
      if (!mod.ignorecase && !isLower) mod.entropy *= 2
      if (mod.ignorecase) mod.pattern = mod.pattern.toLowerCase()
    }

    // oxlint-disable-next-line typescript/no-misused-spread
    mod.chars = [...mod.pattern]
    return mod
  }

  #match(item: SearchItem, mod: Mod): Match | undefined {
    this.score.isFile = itemField(item, "file") !== undefined
    let str = item.text

    if (mod.field) {
      const value = itemField(item, mod.field)
      if (value === undefined)
        return mod.inverse ? { from: 0, score: 1000, search: str, str, to: 0 } : undefined
      str = value
    }

    const original = str
    if (mod.ignorecase) str = str.toLowerCase()

    if (mod.regex) return this.#regex(original, mod)
    if (mod.fuzzy) return this.#fuzzy(str, original, mod.chars)

    let from = -1
    let to = -1
    if (mod.exactPrefix) {
      if (str.startsWith(mod.pattern)) {
        from = 0
        to = mod.pattern.length - 1
      }
    } else if (mod.exactSuffix) {
      if (str.endsWith(mod.pattern)) {
        from = str.length - mod.pattern.length
        to = str.length - 1
      }
    } else {
      from = str.indexOf(mod.pattern)
      to = from + mod.pattern.length - 1
      while (mod.word && from >= 0) {
        if (this.score.isLeftBoundary(str, from) && this.score.isRightBoundary(str, to)) break
        from = str.indexOf(mod.pattern, to + 1)
        to = from + mod.pattern.length - 1
      }
    }

    if (mod.inverse)
      return from === -1 ? { from: 0, score: 1000, search: str, str: original, to: 0 } : undefined
    if (from >= 0)
      return { from, score: this.score.get(original, from, to), search: str, str: original, to }
    return undefined
  }

  #regex(str: string, mod: Mod): Match | undefined {
    const match = mod.re?.exec(str)
    if (!match?.[0]) return undefined
    const from = match.index
    const to = from + match[0].length - 1
    return { from, score: this.score.get(str, from, to), search: str, str, to }
  }

  #fuzzyFind(
    str: string,
    original: string,
    pattern: string[],
    init = 0
  ): Pick<Match, "from" | "to" | "score"> | undefined {
    const from = str.indexOf(pattern[0] ?? "", init)
    if (from === -1) return undefined
    this.score.init(original, from)
    let last = from
    for (let i = 1; i < pattern.length; i++) {
      last = str.indexOf(pattern[i], last + 1)
      // Bail before reading the score: a partial accumulation never
      // escapes this method, so `#fuzzy` only ever sees a score that
      // corresponds to a fully-matched window.
      if (last === -1) return undefined
      this.score.update(last)
    }
    return { from, score: this.score.score, to: last }
  }

  #fuzzy(str: string, original: string, pattern: string[]): Match | undefined {
    // Anchor on every occurrence of the first char and keep the
    // highest-scoring window. The score rides in the return value rather
    // than being read off the shared `this.score`, so there's no
    // "is the accumulator aligned with `best` right now?" invariant.
    let best = this.#fuzzyFind(str, original, pattern)
    if (!best) return undefined
    for (
      let next = this.#fuzzyFind(str, original, pattern, best.from + 1);
      next;
      next = this.#fuzzyFind(str, original, pattern, next.from + 1)
    ) {
      if (next.score > best.score) best = next
    }
    return { from: best.from, score: best.score, search: str, str: original, to: best.to }
  }

  #fuzzyPositions(str: string, pattern: string[], from: number): number[] {
    const ret = [from]
    let last = from
    for (let i = 1; i < pattern.length; i++) {
      last = str.indexOf(pattern[i], last + 1)
      if (last === -1) break
      ret.push(last)
    }
    return ret
  }
}

function itemField(item: SearchItem, field: string): string | undefined {
  const value = item[field as keyof SearchItem] as unknown
  if (value === undefined || value === null) return undefined
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
    return String(value)
  if (Array.isArray(value)) return value.join(" ")
  return
}

function parseFilePattern(pattern: string): string | undefined {
  return (
    pattern.match(/^(.*[/\\].*):\d*:?:?\d*$/)?.[1] ??
    pattern.match(/^(.+\.[a-z_]+):\d*:?:?\d*$/)?.[1]
  )
}
