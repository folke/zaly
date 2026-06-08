import type { SearchItem } from "../../src/search/index.ts"

import { describe, expect, test } from "vitest"
import { Matcher, sorter } from "../../src/search/index.ts"

const match = (query: string, text: string, opts?: ConstructorParameters<typeof Matcher>[0]) => {
  const matcher = new Matcher(opts)
  matcher.init(query)
  return matcher.match(text)
}

describe("Matcher", () => {
  test("fuzzy-matches subsequences", () => {
    expect(match("wt", "widget.ts")).toBeGreaterThan(0)
    expect(match("foo", "foo")).toBeGreaterThan(0)
    expect(match("xyz", "widget.ts")).toBe(0)
  })

  test("empty query matches everything", () => {
    expect(match("", "widget.ts")).toBeGreaterThan(0)
  })

  test("scores contiguous and boundary matches higher", () => {
    expect(match("abc", "abcxyz")).toBeGreaterThan(match("abc", "a-b-c"))
    expect(match("wid", "widget.ts")).toBeGreaterThan(match("wid", "some-widget.ts"))
  })

  test("uses smartcase", () => {
    expect(match("wt", "WIDGET.TS")).toBeGreaterThan(0)
    expect(match("WT", "widget.ts")).toBe(0)
    expect(match("WT", "WIDGET.TS")).toBeGreaterThan(0)
  })

  test("ANDs words and ORs alternatives", () => {
    expect(match("foo bar", "foo xxx bar")).toBeGreaterThan(0)
    expect(match("foo bar", "foo xxx baz")).toBe(0)
    expect(match("foo | bar", "xxbar")).toBeGreaterThan(0)
    expect(match("foo | bar", "xxbaz")).toBe(0)
  })

  test("supports exact, prefix, suffix, word, and inverse modifiers", () => {
    expect(match("'foo", "xxfoo")).toBeGreaterThan(0)
    expect(match("^foo", "foobar")).toBeGreaterThan(0)
    expect(match("^foo", "xxfoo")).toBe(0)
    expect(match("foo$", "xxfoo")).toBeGreaterThan(0)
    expect(match("foo$", "foobar")).toBe(0)
    expect(match("'foo'", "xx foo yy")).toBeGreaterThan(0)
    expect(match("'foo'", "xx foobar yy")).toBe(0)
    expect(match("!foo", "bar")).toBeGreaterThan(0)
    expect(match("!foo", "foobar")).toBe(0)
  })

  test("supports field modifiers", () => {
    const matcher = new Matcher<SearchItem & { role: string }>()
    matcher.init("role:user")
    expect(matcher.match({ role: "user", text: "assistant: hello" })).toBeGreaterThan(0)
    expect(matcher.match({ role: "assistant", text: "user: hello" })).toBe(0)
    expect(matcher.fields()).toEqual(["role"])
  })

  test("matches array fields", () => {
    const matcher = new Matcher<SearchItem & { tags: string[] }>()
    matcher.init("tags:bug")
    expect(matcher.match({ tags: ["bug", "ui"], text: "issue" })).toBeGreaterThan(0)
    expect(matcher.match({ tags: ["docs", "ui"], text: "issue" })).toBe(0)
  })

  test("regex honors ignorecase and smartcase", () => {
    const matcher = new Matcher({ regex: true })
    matcher.init("foo")
    expect(matcher.match("FOO")).toBeGreaterThan(0)

    matcher.init("Foo")
    expect(matcher.match("foo")).toBe(0)
    expect(matcher.match("Foo")).toBeGreaterThan(0)
  })

  test("updates items in place", () => {
    const matcher = new Matcher()
    matcher.init("wt")
    const item: SearchItem = { idx: 0, text: "widget.ts" }
    expect(matcher.update(item).score > 0).toBe(true)
    expect(item.score).toBeGreaterThan(0)
  })

  test("calculates positions separately", () => {
    const matcher = new Matcher()
    matcher.init("wt")
    expect(matcher.positions("widget.ts")).toEqual([0, 5])

    matcher.init("foo | bar")
    expect(matcher.positions("xxbar foo")).toEqual([2, 3, 4, 6, 7, 8])
  })

  test("calculates fuzzy positions with ignorecase", () => {
    const matcher = new Matcher()
    matcher.init("wt")
    expect(matcher.match("WIDGET.TS")).toBeGreaterThan(0)
    expect(matcher.positions("WIDGET.TS")).toEqual([0, 5])
  })

  test("ignorecase fuzzy positions don't truncate on a later uppercase char", () => {
    // Regression: greedy indexOf of a lowercased pattern against the
    // original-cased string used to miss the uppercase target and stop
    // emitting positions. "fb" → "FooBar" must yield both, not just [0].
    const matcher = new Matcher()
    matcher.init("fb")
    expect(matcher.match("FooBar")).toBeGreaterThan(0)
    expect(matcher.positions("FooBar")).toEqual([0, 3])
  })

  test("exact / prefix / suffix positions cover the whole span", () => {
    const matcher = new Matcher()
    matcher.init("'get")
    expect(matcher.positions("widget")).toEqual([3, 4, 5])
    matcher.init("^wid")
    expect(matcher.positions("widget")).toEqual([0, 1, 2])
    matcher.init("get$")
    expect(matcher.positions("widget")).toEqual([3, 4, 5])
  })

  test("picks the highest-scoring fuzzy window, not the first", () => {
    // "ab" occurs scattered early and contiguous later; the contiguous
    // boundary occurrence should win the score.
    const scattered = match("ab", "a_xx_b_zz")
    const contiguous = match("ab", "zz_zz_ab")
    expect(contiguous).toBeGreaterThan(scattered)
  })

  test("rewards camelCase boundaries", () => {
    // "gp" hits a camelCase boundary in getProps (g + P) vs a mid-word
    // second char in grump.
    expect(match("gp", "getProps")).toBeGreaterThan(match("gp", "grump"))
  })

  test("rewards path-delimiter boundaries", () => {
    // "at" starts a word after "/" in src/app/types vs mid-word in "matter".
    expect(match("at", "src/app/types")).toBeGreaterThan(match("at", "matter"))
  })

  test("filename bonus rewards a match with no path separator after it", () => {
    // Same text/file; the bonus depends on filenameBonus being on.
    const item = { file: "src/index.ts", text: "src/index.ts" }
    const withBonus = new Matcher({ filenameBonus: true })
    withBonus.init("index")
    const without = new Matcher({ filenameBonus: false })
    without.init("index")
    expect(withBonus.match(item)).toBeGreaterThan(without.match(item))
  })

  test("file:line patterns match the file field", () => {
    const matcher = new Matcher<SearchItem & { file: string }>()
    matcher.init("src/app.ts:42")
    expect(matcher.match({ file: "src/app.ts", text: "src/app.ts" })).toBeGreaterThan(0)
    expect(matcher.match({ file: "src/other.ts", text: "src/other.ts" })).toBe(0)
  })

  test("init returns false for an unchanged (trimmed) pattern", () => {
    const matcher = new Matcher()
    expect(matcher.init("foo")).toBe(true)
    expect(matcher.init("foo")).toBe(false)
    expect(matcher.init("  foo  ")).toBe(false)
    expect(matcher.init("bar")).toBe(true)
  })

  test("empty() reflects whether there are active mods", () => {
    const matcher = new Matcher()
    expect(matcher.empty()).toBe(true)
    matcher.init("foo")
    expect(matcher.empty()).toBe(false)
    matcher.init("")
    expect(matcher.empty()).toBe(true)
  })

  test("inverse term excludes matches but keeps non-matches", () => {
    expect(match("foo !bar", "foo qux")).toBeGreaterThan(0)
    expect(match("foo !bar", "foo bar")).toBe(0)
  })

  test("invalid regex fails closed instead of throwing", () => {
    const matcher = new Matcher({ regex: true })
    matcher.init("(unclosed")
    expect(() => matcher.match("unclosed")).not.toThrow()
    expect(matcher.match("unclosed")).toBe(0)
  })

  test("missing field is a non-match (and inverse missing field matches)", () => {
    const yes = new Matcher()
    yes.init("role:user")
    expect(yes.match({ text: "no role here" })).toBe(0)

    const no = new Matcher()
    no.init("!role:user")
    expect(no.match({ text: "no role here" })).toBeGreaterThan(0)
  })

  test("numeric and boolean fields stringify for matching", () => {
    const matcher = new Matcher<SearchItem & { count: number }>()
    matcher.init("count:42")
    expect(matcher.match({ count: 42, text: "x" })).toBeGreaterThan(0)
    expect(matcher.match({ count: 7, text: "x" })).toBe(0)
  })
})

describe("sorter", () => {
  test("sorts by score desc then idx", () => {
    const items: SearchItem[] = [
      { idx: 2, score: 10, text: "c" },
      { idx: 0, score: 20, text: "a" },
      { idx: 1, score: 20, text: "b" },
    ]
    expect(items.toSorted(sorter()).map((item) => item.text)).toEqual(["a", "b", "c"])
  })

  test("supports length fields", () => {
    const items: SearchItem[] = [
      { score: 1, text: "longer" },
      { score: 1, text: "x" },
    ]
    expect(items.toSorted(sorter([{ len: true, name: "text" }])).map((item) => item.text)).toEqual([
      "x",
      "longer",
    ])
  })

  test("skips fields that are undefined on either side", () => {
    const items: SearchItem[] = [
      { idx: 1, score: 5, text: "b" },
      { idx: 0, text: "a" }, // no score
    ]
    // score is skipped (undefined on one side), falls through to idx asc
    expect(items.toSorted(sorter()).map((item) => item.text)).toEqual(["a", "b"])
  })

  test("sorts booleans true-first", () => {
    const items: SearchItem[] = [
      { idx: 0, score: 0, text: "a" },
      { idx: 1, score: 2, text: "b" },
    ]
    expect(
      items
        .toSorted(sorter([{ name: "score" as never, desc: true }, "idx" as never]))
        .map((i) => i.text)
    ).toEqual(["b", "a"])
  })
})
