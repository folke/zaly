import type { Match, SearchItem } from "../../../src/search/index.ts"
import type { CompletionSource } from "../../../src/widgets/autocomplete.ts"
import type { GithubItem } from "../../../src/widgets/completions/github.ts"

import { describe, expect, test, vi } from "vitest"
import { unwrap } from "../../../src/index.ts"
import { Matcher } from "../../../src/search/index.ts"
import { githubSource } from "../../../src/widgets/completions/github.ts"

const match = <T extends SearchItem = SearchItem>(q: string): Match<T> => {
  const matcher = new Matcher<T>()
  matcher.init(q)
  const fn = (s: string | T) => matcher.match(s)
  return Object.assign(fn, {
    matcher: (pattern: string) => {
      const m = new Matcher<T>()
      m.init(pattern)
      return (s: string | T) => m.match(s)
    },
  })
}

const complete = async (src: CompletionSource<GithubItem>, query: string) => {
  const items = unwrap(src.complete)
  return typeof items === "function" ? await items(query, match(query)) : items
}

const sample: GithubItem[] = [
  {
    text: "#123 Fix flaky",
    author: { login: "alice" },
    number: 123,
    state: "open",
    title: "Fix flaky autocomplete race",
    type: "issue",
    url: "https://github.com/owner/repo/issues/123",
  },
  {
    text: "#124 Add github source",
    author: { login: "bob" },
    number: 124,
    state: "open",
    title: "Add github source",
    type: "pr",
    url: "https://github.com/owner/repo/pull/124",
  },
  {
    text: "#125 Update docs",
    author: { login: "carol" },
    number: 125,
    state: "closed",
    title: "Update docs",
    type: "issue",
    url: "https://github.com/owner/repo/issues/125",
  },
]

const fakeFetcher = () => Promise.resolve(sample)

describe("githubSource", () => {
  test("returns the fetched items on an empty query", async () => {
    const src = githubSource({ fetcher: fakeFetcher })
    const items = await complete(src, "")
    expect(items.map((i) => i.number)).toEqual([123, 124, 125])
  })

  test("fuzzy-matches on '#<num> <title>' so digits and words both work", async () => {
    const src = githubSource({ fetcher: fakeFetcher })
    const byNum = await complete(src, "124")
    expect(byNum.map((i) => i.number)).toEqual([124])
    const byWord = await complete(src, "flaky")
    expect(byWord.map((i) => i.number)).toEqual([123])
  })

  test("fetcher is invoked at most once across many complete() calls", async () => {
    const fetcher = vi.fn(fakeFetcher)
    const src = githubSource({ fetcher })
    await complete(src, "")
    await complete(src, "auto")
    await complete(src, "#125")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test("fetcher failure degrades to empty results (doesn't throw)", async () => {
    const src = githubSource({ fetcher: () => Promise.reject(new Error("no gh")) })
    const items = await complete(src, "")
    expect(items).toEqual([])
  })

  test("accept inserts `#<num> ` so the reference is markdown-ready", () => {
    const src = githubSource({ fetcher: fakeFetcher })
    const inserted = src.accept!(sample[0], "flaky")
    expect(inserted).toBe("#123 ")
  })

  test("custom prefix threads through accept", () => {
    const src = githubSource({ fetcher: fakeFetcher, prefix: "gh#" })
    const inserted = src.accept!(sample[1], "124")
    expect(inserted).toBe("gh#124 ")
  })

  test("default trigger matches `#` at word boundary but not inside a word", () => {
    const src = githubSource({ fetcher: fakeFetcher })
    const rx = src.triggers[0]
    expect("#".match(rx)?.[0]).toBe("#")
    expect("fixes #123".match(rx)?.[0]).toBe("#")
    expect("color#abc".match(rx)?.[0]).toBeUndefined()
  })

  test("state option is forwarded to the fetcher", async () => {
    const fetcher = vi.fn(fakeFetcher)
    const src = githubSource({ fetcher, state: "all" })
    await complete(src, "")
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), "all")
  })
})
