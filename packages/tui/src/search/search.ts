// oxlint-disable no-await-in-loop
import type { MaybePromise } from "@zaly/shared"
import type { MatcherOptions, ScoredItem, SearchItem } from "./matcher.ts"
import type { Sorter, SortField } from "./sort.ts"

import { TopK } from "@zaly/shared/minheap"
import { Matcher } from "./matcher.ts"
import { sorter } from "./sort.ts"

export type SearchOptions<T extends SearchItem = SearchItem> = MatcherOptions & {
  sort?: boolean | readonly SortField<T>[]
  filter?: boolean
  sortEmpty?: boolean
  frecency?: () => (file: string) => number
  limit?: number
  throttle?: number
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
export type Match<T extends SearchItem = SearchItem> = (s: string | T) => number

const BONUS_FRECENCY = 8
const SEARCH_LIMIT = 1000
const aborted = Symbol("search.aborted")

export class Searcher<T extends SearchItem = SearchItem> {
  #opts: SearchOptions<T>
  #sorter?: Sorter<T>
  #matcher: Matcher<T>
  #ac?: AbortController

  constructor(opts: SearchOptions<T>) {
    this.#opts = opts
    const sortOpts = opts.sort === true ? undefined : opts.sort
    this.#sorter = sortOpts === false ? undefined : sorter(sortOpts)
    this.#matcher = new Matcher(opts)
  }

  /** Create a match function bound to the current pattern. If the
   * matcher has been updated since the search started, match will
   * return `0` to indicate no match, to prevent stale results */
  createMatch(opts: { signal: AbortSignal }): Match<T> {
    const m = this.#matcher
    return (s: string | T) => (opts.signal.aborted ? 0 : m.match(s))
  }

  async search(
    items: SearchItems<T>,
    query = "",
    opts: { progress?: (results: ScoredItem<T>[]) => MaybePromise } = {}
  ): Promise<ScoredItem<T>[]> {
    try {
      return await this.#search(items, query, opts)
    } catch (error) {
      if (error === aborted) return []
      throw error
    }
  }

  async #search(
    items: SearchItems<T>,
    query = "",
    opts: { progress?: (results: ScoredItem<T>[]) => MaybePromise } = {}
  ): Promise<ScoredItem<T>[]> {
    this.#ac?.abort(aborted)
    const ac = (this.#ac = new AbortController())

    const m = this.#matcher
    m.init(query)
    const f = this.#opts.frecency?.()
    const s = this.#sorter
    const limit = this.#opts.limit ?? (this.#sorter ? SEARCH_LIMIT : Infinity)
    const ret: ScoredItem<T>[] = []
    let match = (item: T) => this.#matcher.update(item)
    const topk =
      s && (this.#opts.sortEmpty || !m.empty())
        ? new TopK<ScoredItem<T>>(limit, (a, b) => -s(a, b))
        : undefined

    if (typeof items === "function") {
      match = (item: T) => item as ScoredItem<T>
      items = await items(query, this.createMatch({ signal: ac.signal }))
      ac.signal.throwIfAborted()
    }

    if (items.length === 0) return []

    const results = () => topk?.sorted() ?? ret

    // Process items in three phases, so that the results in the UI stabilize faster:
    // - previous topk results (topk)
    // - scored items (score)
    // - unscored items (rest)
    const todo: [T[], T[], T[]] = [[], [], []]
    let idx = 0
    if (!topk) todo[0] = items as T[]
    else {
      for (const item of items) {
        item.idx = idx++
        const it = item as ScoredItem<T>
        if (it.topk) todo[0].push(item)
        else if (it.score) todo[1].push(item)
        else todo[2].push(item)
      }
    }

    const doFilter = !m.empty() && (this.#opts.filter ?? true)

    let lastYield = performance.now()
    let dirty = false
    let count = 0

    loop: for (const todos of todo) {
      for (const item of todos) {
        ac.signal.throwIfAborted()
        if (count++ % 256 === 0) {
          const now = performance.now()
          if (now - lastYield >= (this.#opts.throttle ?? 16)) {
            lastYield = now
            await new Promise((r) => setImmediate(r))
            if (opts.progress && dirty) {
              dirty = false
              await opts.progress(results())
            }
          }
        }
        const si = match(item)
        if (si.file && si.score && f) {
          const frecency = f(si.file)
          si.score += (1 - 1 / (1 + frecency)) * BONUS_FRECENCY
        }
        if (doFilter && si.score === 0) continue
        if (topk) {
          si.topk = false
          const ta = topk.add(si)
          if (ta.added) {
            si.topk = true
            dirty = true
            if (ta.evicted) ta.evicted.topk = false
          }
        } else {
          ret.push(si)
          dirty = true
          if (ret.length >= limit) break loop
        }
      }
    }

    return results()
  }

  positions(s: string | T): number[] {
    return this.#matcher.positions(s)
  }
}
