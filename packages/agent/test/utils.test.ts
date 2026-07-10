import type { Message } from "@zaly/ai"

import { describe, expect, test } from "vitest"
import { truncate } from "../src/utils/truncate.ts"
import { addUsage, TokenUsage } from "../src/utils/usage.ts"

describe("truncate", () => {
  test("returns small text untouched", () => {
    const r = truncate("a\nb\nc", { maxChars: 100, maxLines: 10 })
    expect(r.text).toBe("a\nb\nc")
    expect(r.truncated).toBe(false)
    expect(r.origLines).toBe(3)
    expect(r.origChars).toBe(5)
  })

  test("truncates overlong non-json lines", () => {
    const r = truncate("0123456789", { maxLineChars: 4 })
    expect(r.truncated).toBe(true)
    expect(r.truncatedLineChars).toBe(true)
    expect(r.text).toBe("0123 [ … truncated 6 chars]")
  })

  test("preserves head and tail lines by default", () => {
    const input = Array.from({ length: 10 }, (_, i) => `L${i + 1}`).join("\n")
    const r = truncate(input, { head: 2, maxChars: 1000, maxLines: 5 })
    expect(r.truncated).toBe(true)
    expect(r.truncatedLines).toBe(true)
    expect(r.text.split("\n")).toEqual(["L1", "L2", " [ … truncated 5 lines]", "L8", "L9", "L10"])
  })

  test("supports head strategy", () => {
    const input = Array.from({ length: 5 }, (_, i) => `L${i + 1}`).join("\n")
    const r = truncate(input, { maxChars: 1000, maxLines: 2, strategy: "head" })
    expect(r.text.split("\n")).toEqual(["L1", "L2", " [ … truncated 3 lines]"])
  })

  test("supports tail strategy", () => {
    const input = Array.from({ length: 5 }, (_, i) => `L${i + 1}`).join("\n")
    const r = truncate(input, { maxChars: 1000, maxLines: 2, strategy: "tail" })
    expect(r.text.split("\n")).toEqual([" [ … truncated 3 lines]", "L4", "L5"])
  })

  test("treats fractional head as fraction of maxLines", () => {
    const input = Array.from({ length: 8 }, (_, i) => `L${i + 1}`).join("\n")
    const r = truncate(input, { head: 0.25, maxChars: 1000, maxLines: 4 })
    expect(r.opts.head).toBe(1)
    expect(r.text.split("\n")).toEqual(["L1", " [ … truncated 4 lines]", "L6", "L7", "L8"])
  })

  test("truncates huge one-line json by chars without line budgeting", () => {
    const input = `{"data":"${"x".repeat(100)}"}`
    const r = truncate(input, { maxChars: 40, maxLineChars: 10, maxLines: 10 })
    expect(r.truncated).toBe(true)
    expect(r.truncatedChars).toBe(true)
    expect(r.truncatedLineChars).toBeUndefined()
    expect(r.truncatedLines).toBeUndefined()
    expect(r.text).toContain("[truncated")
    expect(r.text.startsWith("{")).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(80)
  })

  test("string and Buffer with identical content produce identical results", () => {
    const text = "one\ntwo\nthree"
    expect(truncate(text)).toEqual(truncate(Buffer.from(text)))
  })
})

describe("addUsage", () => {
  test("sums input/output counts", () => {
    expect(addUsage({ input: 10, output: 5 }, { input: 3, output: 2 })).toEqual({
      input: 13,
      output: 7,
    })
  })

  test("optional fields included when set on either side", () => {
    const r = addUsage({ cacheRead: 100, input: 1, output: 1 }, { input: 1, output: 1 })
    expect(r.cacheRead).toBe(100)
    expect(r.cacheWrite).toBeUndefined()
  })

  test("optional fields stay undefined when neither side has them", () => {
    const r = addUsage({ input: 1, output: 1 }, { input: 1, output: 1 })
    expect(r.cacheRead).toBeUndefined()
    expect(r.cacheWrite).toBeUndefined()
    expect(r.reasoning).toBeUndefined()
  })

  test("sums reasoning + cacheWrite when both sides contribute", () => {
    const r = addUsage(
      { cacheWrite: 5, input: 1, output: 1, reasoning: 10 },
      { cacheWrite: 3, input: 1, output: 1, reasoning: 4 }
    )
    expect(r.reasoning).toBe(14)
    expect(r.cacheWrite).toBe(8)
  })

  test("treats absent counts on one side as 0 for that side", () => {
    const r = addUsage({ cacheRead: 50, input: 1, output: 1 }, { input: 1, output: 1 })
    expect(r.cacheRead).toBe(50)
  })

  test("recursively sums nested cost usage", () => {
    expect(
      addUsage(
        { cost: { input: 1, output: 2 }, input: 10, output: 20 },
        { cost: { input: 3, output: 4, reasoning: 5 }, input: 30, output: 40 }
      )
    ).toEqual({
      cost: { input: 4, output: 6, reasoning: 5 },
      input: 40,
      output: 60,
    })
  })
})

describe("TokenUsage", () => {
  test("starts empty and exposes last/total/context accessors", () => {
    const usage = new TokenUsage()
    expect(usage.last).toEqual({ input: 0, output: 0 })
    expect(usage.total).toEqual({ input: 0, output: 0 })
    expect(usage.cost).toEqual({ input: 0, output: 0 })
    expect(usage.contextSize).toBe(0)

    usage.add({
      cacheRead: 3,
      cacheWrite: 4,
      cost: { input: 1, output: 2 },
      input: 10,
      output: 20,
      reasoning: 5,
    })
    expect(usage.input).toBe(10)
    expect(usage.output).toBe(20)
    expect(usage.cacheRead).toBe(3)
    expect(usage.cacheWrite).toBe(4)
    expect(usage.reasoning).toBe(5)
    expect(usage.contextSize).toBe(37)
    expect(usage.total).toEqual({
      cacheRead: 3,
      cacheWrite: 4,
      cost: { input: 1, output: 2 },
      input: 10,
      output: 20,
      reasoning: 5,
    })
  })

  test("seeds totals from assistant message usage and ignores other messages", () => {
    const usage = new TokenUsage([
      { content: "ignored", role: "user" },
      { content: "counted", meta: { usage: { input: 5, output: 6 } }, role: "assistant" },
      { content: "ignored", role: "assistant" },
    ] as Message[])

    expect(usage.last).toEqual({ input: 5, output: 6 })
    expect(usage.total).toEqual({ input: 5, output: 6 })
  })

  test("resetLast clears only the last usage", () => {
    const usage = new TokenUsage()
    usage.add({ input: 1, output: 2 })
    usage.resetLast()
    expect(usage.last).toEqual({ input: 0, output: 0 })
    expect(usage.total).toEqual({ input: 1, output: 2 })
  })
})
