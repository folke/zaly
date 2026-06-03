import type { GithubItem } from "../../../src/widgets/completions/github.ts"

import { describe, expect, test, vi } from "vitest"
import { fuzzyScore } from "../../../src/widgets/completions/fuzzy.ts"
import { githubSource } from "../../../src/widgets/completions/github.ts"

const match = (q: string) => (s: string) => fuzzyScore(q, s)

const sample: GithubItem[] = [
  {
    value: 123,
    author: { login: "alice" },
    number: 123,
    state: "open",
    title: "Fix flaky autocomplete race",
    type: "issue",
    url: "https://github.com/owner/repo/issues/123",
  },
  {
    value: 124,
    author: { login: "bob" },
    number: 124,
    state: "open",
    title: "Add github source",
    type: "pr",
    url: "https://github.com/owner/repo/pull/124",
  },
  {
    value: 125,
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
    const items = await src.complete("", match(""))
    expect(items.map((i) => i.number)).toEqual([123, 124, 125])
  })

  test("fuzzy-matches on '#<num> <title>' so digits and words both work", async () => {
    const src = githubSource({ fetcher: fakeFetcher })
    const byNum = await src.complete("124", match("124"))
    expect(byNum.map((i) => i.number)).toEqual([124])
    const byWord = await src.complete("flaky", match("flaky"))
    expect(byWord.map((i) => i.number)).toEqual([123])
  })

  test("fetcher is invoked at most once across many complete() calls", async () => {
    const fetcher = vi.fn(fakeFetcher)
    const src = githubSource({ fetcher })
    await src.complete("", match(""))
    await src.complete("auto", match("auto"))
    await src.complete("#125", match("#125"))
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  test("fetcher failure degrades to empty results (doesn't throw)", async () => {
    const src = githubSource({ fetcher: () => Promise.reject(new Error("no gh")) })
    const items = await src.complete("", match(""))
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
    await src.complete("", match(""))
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), "all")
  })
})
