import { describe, expect, test } from "vitest"
import { fuzzyScore, rank } from "../../../src/widgets/completions/fuzzy.ts"

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
