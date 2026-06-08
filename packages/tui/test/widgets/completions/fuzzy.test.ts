import type { SearchItem } from "../../../src/search/index.ts"

import { describe, expect, test } from "vitest"
import { Matcher, sorter } from "../../../src/search/index.ts"

const fuzzyScore = (query: string, target: string): number => {
  const matcher = new Matcher({ smartcase: false })
  matcher.init(query)
  return matcher.match(target)
}

const rank = <T>(items: Iterable<T>, score: (item: T) => number, limit?: number): T[] => {
  const ranked: (SearchItem & { item: T; score: number })[] = []
  let idx = 0
  for (const item of items) {
    const s = score(item)
    if (s > 0) ranked.push({ idx, item, score: s, text: String(item) })
    idx++
  }
  return ranked.toSorted(sorter()).slice(0, limit).map((item) => item.item)
}

describe("fuzzyScore", () => {
  test("returns a positive score for subsequence matches", () => {
    expect(fuzzyScore("wt", "widget.ts")).toBeGreaterThan(0)
    expect(fuzzyScore("foo", "foo")).toBeGreaterThan(0)
  })

  test("returns 0 for non-matches", () => {
    expect(fuzzyScore("xyz", "widget.ts")).toBe(0)
  })

  test("empty query matches everything with positive score", () => {
    expect(fuzzyScore("", "widget.ts")).toBeGreaterThan(0)
  })

  test("prefix match scores higher than mid-string", () => {
    expect(fuzzyScore("wid", "widget.ts")).toBeGreaterThan(fuzzyScore("wid", "some-widget.ts"))
  })

  test("contiguous runs score higher than scattered", () => {
    expect(fuzzyScore("abc", "abcxyz")).toBeGreaterThan(fuzzyScore("abc", "a-b-c"))
  })

  test("case-insensitive", () => {
    expect(fuzzyScore("WT", "widget.ts")).toBeGreaterThan(0)
    expect(fuzzyScore("wt", "WIDGET.TS")).toBeGreaterThan(0)
  })
})

describe("rank", () => {
  const items = ["widget.ts", "menu.ts", "a-widget.ts", "no-match"]
  test("drops zero-score items and sorts by descending score", () => {
    const out = rank(items, (s) => fuzzyScore("wid", s))
    expect(out).toEqual(["widget.ts", "a-widget.ts"])
  })

  test("limit caps the result", () => {
    const out = rank(items, (s) => fuzzyScore("t", s), 1)
    expect(out).toHaveLength(1)
  })
})
