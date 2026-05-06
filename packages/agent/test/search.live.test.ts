/**
 * Live integration tests for the `search` tool. Opt-in only — skipped
 * unless BOTH:
 *   - `LIVE=1` is set, AND
 *   - `BRAVE_API_KEY` is available.
 *
 * The `LIVE` gate prevents the bare `bun test` runner from silently
 * hitting paid APIs when an env-loaded shell happens to have the key.
 *
 * Cost control: small `count`, short queries, < 5 requests per run.
 */
import type { MetaPart, TextPart } from "@zaly/ai"

import { describe, expect, test } from "vitest"
import { searchTool } from "../src/tools/search.ts"

const enabled = Boolean(process.env.LIVE) && Boolean(process.env.BRAVE_API_KEY)

type Parts = (MetaPart | TextPart)[]

const callSearch = async (args: Record<string, unknown>): Promise<Parts> => {
  const validated = searchTool.validateParams(args)
  return (await searchTool.call(validated, {})) as Parts
}

describe.skipIf(!enabled)("search: live", () => {
  test("returns a header MetaPart + per-source MetaPart/TextPart pairs", async () => {
    const parts = await callSearch({ query: "tallest mountains in the world", count: 3 })
    expect(parts.length).toBeGreaterThan(0)

    // First part is the search-level header.
    const header = parts[0]
    expect(header.type).toBe("meta")
    if (header.type !== "meta") throw new Error("type narrow")
    expect(header.tag).toBe("search")
    const headerData = header.data as { count: number; query: string; durationMs: number }
    expect(headerData.query).toBe("tallest mountains in the world")
    expect(headerData.count).toBeGreaterThan(0)
    expect(headerData.durationMs).toBeGreaterThan(0)

    // Subsequent parts come in `<source>` meta + text pairs.
    const sources = parts.filter((p): p is MetaPart => p.type === "meta" && p.tag === "source")
    expect(sources.length).toBeGreaterThan(0)
    for (const s of sources) {
      const data = s.data as { url: string }
      expect(typeof data.url).toBe("string")
      expect(data.url).toMatch(/^https?:\/\//)
    }

    // At least one text part with snippet content.
    const texts = parts.filter((p): p is TextPart => p.type === "text")
    expect(texts.length).toBeGreaterThan(0)
    expect(texts.some((t) => t.text.length > 0)).toBe(true)
  }, 30_000)

  test("respects the count parameter", async () => {
    const parts = await callSearch({ query: "typescript", count: 2 })
    const sources = parts.filter((p) => p.type === "meta" && p.tag === "source")
    // The API may return fewer than `count` if not enough relevant pages
    // exist, but never more.
    expect(sources.length).toBeLessThanOrEqual(2)
  }, 30_000)

  test("freshness filter rejected as schema-invalid when not in the enum", () => {
    expect(() => searchTool.validateParams({ query: "x", freshness: "yesterday" })).toThrow(/❌/)
  })

  test("missing query rejected at validation", () => {
    expect(() => searchTool.validateParams({})).toThrow(/❌/)
  })
})

describe("search: offline (no API call)", () => {
  test("validateParams applies defaults (count=10, country=us)", () => {
    const v = searchTool.validateParams({ query: "x" })
    expect(v).toEqual({ query: "x", count: 10, country: "us" })
  })

  test("validateParams coerces string count to integer", () => {
    const v = searchTool.validateParams({ query: "x", count: "5" })
    expect(v.count).toBe(5)
  })

  test("missing BRAVE_API_KEY surfaces a clear AiError", async () => {
    const before = process.env.BRAVE_API_KEY
    delete process.env.BRAVE_API_KEY
    try {
      await expect(callSearch({ query: "x" })).rejects.toMatchObject({ code: "MISSING_API_KEY" })
    } finally {
      if (before !== undefined) process.env.BRAVE_API_KEY = before
    }
  })
})
