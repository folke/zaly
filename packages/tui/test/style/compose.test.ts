import { describe, expect, test } from "vitest"
import { reapplyBg } from "../../src/style/compose.ts"

describe("reapplyBg", () => {
  const bg = "\x1b[48;2;255;0;0m"

  test("no resets: input unchanged", () => {
    expect(reapplyBg("hello", bg)).toBe("hello")
  })

  test("single reset: bg re-applied after", () => {
    expect(reapplyBg("\x1b[38;2;0;0;255mhello\x1b[0mworld", bg)).toBe(
      `\x1b[38;2;0;0;255mhello\x1b[0m${bg}world`
    )
  })

  test("multiple resets: each gets bg re-applied", () => {
    const input = "\x1b[0ma\x1b[0mb\x1b[0m"
    expect(reapplyBg(input, bg)).toBe(`\x1b[0m${bg}a\x1b[0m${bg}b\x1b[0m${bg}`)
  })

  test("empty bg escape: input unchanged (guard)", () => {
    expect(reapplyBg("\x1b[0mhello", "")).toBe("\x1b[0mhello")
  })
})
