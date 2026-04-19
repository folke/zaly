import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { progress } from "../../src/widgets/progress.ts"

function strip(s: string): string {
  // eslint-disable-next-line no-control-regex -- stripping ANSI is the point.
  return s.replace(/\x1b\[[\d;]*m/g, "")
}

describe("progress() basics", () => {
  test("fills the bar proportionally to value/total", async () => {
    const ctx = createCtx({ width: 10 })
    const [row] = await progress({ total: 4, value: 1 }).render(ctx)
    // 25% of 10 cells = 2.5 → rounds to 3 filled. (Integer rounding is a
    // fair default; callers who need exact cell math can override.)
    const plain = strip(row)
    const filled = (plain.match(/█/g) ?? []).length
    const empty = (plain.match(/░/g) ?? []).length
    expect(filled).toBe(3)
    expect(empty).toBe(7)
  })

  test("value is clamped into [0, total]", async () => {
    const ctx = createCtx({ width: 10 })
    const [rowNeg] = await progress({ total: 10, value: -5 }).render(ctx)
    expect(strip(rowNeg)).toBe("░".repeat(10))
    const [rowOver] = await progress({ total: 10, value: 999 }).render(ctx)
    expect(strip(rowOver)).toBe("█".repeat(10))
  })

  test("label: 'auto' reserves width and shows percent", async () => {
    const ctx = createCtx({ width: 20 })
    const [row] = await progress({ label: "auto", total: 2, value: 1 }).render(ctx)
    const plain = strip(row)
    expect(plain.endsWith(" 50%")).toBe(true)
    // 20 total − 4 (" 50%") = 16 cells for the bar.
    const filled = (plain.match(/█/g) ?? []).length
    const empty = (plain.match(/░/g) ?? []).length
    expect(filled + empty).toBe(16)
    expect(filled).toBe(8)
  })

  test("custom label is rendered verbatim and its width is reserved", async () => {
    const ctx = createCtx({ width: 12 })
    const [row] = await progress({ label: "done", total: 10, value: 10 }).render(ctx)
    const plain = strip(row)
    expect(plain.endsWith(" done")).toBe(true)
    expect(plain.startsWith("█".repeat(7))).toBe(true) // 12 − 5
  })
})
