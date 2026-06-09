import type { MaybePromise } from "@zaly/shared"
import type { MatcherOptions, ScoredItem, SearchItem } from "./matcher.ts"
import type { Sorter, SortField } from "./sort.ts"

import { isPromiseLike } from "@zaly/shared"
import { Matcher } from "./matcher.ts"
import { sorter } from "./sort.ts"

export type SearchOptions<T extends SearchItem = SearchItem> = MatcherOptions & {
  sort?: boolean | readonly SortField<T>[]
  filter?: boolean
  sortEmpty?: boolean
  reverse?: boolean
}

export type SearchFn<T extends SearchItem = SearchItem> = (
  query: string,
  match: Match<T>
) => MaybePromise<ScoredItem<T>[]>

export type SearchItems<T extends SearchItem = SearchItem> = readonly T[] | SearchFn<T>

/** Match function handed to `complete`. Returns `0` for no match,
 *  positive integer otherwise — so both `match(s) > 0` and the
 *  idiomatic `.filter(match(s))` work (0 is falsy). The magnitude is a
 *  score the source can use to rank its own candidates when it cares
 *  about order. */
export type Match<T extends SearchItem = SearchItem> = {
  /** Create a matcher function bound to a specific pattern. Useful when
   * a source needs to match against a different pattern **/
  matcher: (pattern: string) => (s: string | T) => number
} & ((s: string | T) => number)

export class Searcher<T extends SearchItem = SearchItem> {
  #opts: SearchOptions<T>
  #sorter?: Sorter<T>
  #matcher: Matcher<T>

  constructor(opts: SearchOptions<T>) {
    this.#opts = opts
    const sortOpts = opts.sort === true ? undefined : opts.sort
    this.#sorter = sortOpts === false ? undefined : sorter(sortOpts)
    this.#matcher = new Matcher(opts)
  }

  /** Create a match function bound to the current pattern. If the
   * matcher has been updated since the search started, match will
   * return `0` to indicate no match, to prevent stale results */
  createMatch(): Match<T> {
    const m = this.#matcher
    const tick = m.tick
    const match = (s: string | T) => (m.tick === tick ? m.match(s) : 0)
    return Object.assign(match, {
      matcher: (pattern: string) => {
        const ma = new Matcher<T>(this.#opts)
        ma.init(pattern)
        return (s: string | T) => (ma.tick === tick ? ma.match(s) : 0)
      },
    })
  }

  search(items: T[], query?: string): ScoredItem<T>[]
  search(
    items: (query: string, match: Match<T>) => ScoredItem<T>[],
    query?: string
  ): ScoredItem<T>[]
  search(items: SearchItems<T>, query?: string): MaybePromise<ScoredItem<T>[]>
  search(items: SearchItems<T>, query = ""): MaybePromise<ScoredItem<T>[]> {
    const m = this.#matcher
    m.init(query)
    const tick = m.tick

    let ret: ScoredItem<T>[] = []
    if (typeof items === "function") {
      const maybe = items(query, this.createMatch())
      if (isPromiseLike(maybe))
        return maybe.then((res) => {
          if (tick !== m.tick) return [] // Not in the same tick, discard results
          return this.#search(res)
        })
      ret = maybe
    } else ret = items.map((item) => this.#matcher.update(item))

    return this.#search(ret)
  }

  #search(ret: ScoredItem<T>[]): ScoredItem<T>[] {
    const m = this.#matcher

    // Original index
    for (let i = 0; i < ret.length; i++) ret[i].idx ??= i

    if (!m.empty() && (this.#opts.filter ?? true)) ret = ret.filter(({ score }) => score > 0)
    if (this.#sorter && (this.#opts.sortEmpty || !m.empty())) ret = ret.toSorted(this.#sorter)
    // if (this.#opts.reverse) ret.reverse()

    return ret
  }

  positions(s: string | T): number[] {
    return this.#matcher.positions(s)
  }
}
