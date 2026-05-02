import { describe, expect, test } from "vitest"
import { addUsage, summarizeOutput } from "../src/utils/index.ts"

describe("summarizeOutput", () => {
  test("empty input → empty result", () => {
    expect(summarizeOutput("")).toEqual({ text: "", totalLines: 0, truncated: false })
  })

  test("under the limit returns full text untouched", () => {
    const r = summarizeOutput("a\nb\nc")
    expect(r).toEqual({ text: "a\nb\nc", totalLines: 3, truncated: false })
  })

  test("trailing newline is not counted as an extra line", () => {
    const r = summarizeOutput("a\nb\nc\n")
    expect(r).toEqual({ text: "a\nb\nc", totalLines: 3, truncated: false })
  })

  test("over limit produces head+tail with elision marker", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `L${i + 1}`).join("\n")
    const r = summarizeOutput(lines, { head: 5, tail: 5 })
    if ("binary" in r) throw new Error("expected text result")
    expect(r.truncated).toBe(true)
    expect(r.totalLines).toBe(50)
    const parts = r.text.split("\n")
    expect(parts[0]).toBe("L1")
    expect(parts[4]).toBe("L5")
    expect(parts[5]).toMatch(/40 lines elided/)
    expect(parts[6]).toBe("L46")
    expect(parts.at(-1)).toBe("L50")
  })

  test("logPath is woven into the elision marker", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join("\n")
    const r = summarizeOutput(lines, { head: 2, tail: 2, logPath: "/tmp/log.txt" })
    if ("binary" in r) throw new Error("expected text result")
    expect(r.text).toContain("/tmp/log.txt")
  })

  test("string and Buffer with identical content produce identical results", () => {
    const text = "one\ntwo\nthree"
    expect(summarizeOutput(text)).toEqual(summarizeOutput(Buffer.from(text)))
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
})
