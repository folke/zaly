import { describe, expect, test } from "vitest"
import { reapplyBg, resolveStyleSlot } from "../../src/style/compose.ts"
import { moon } from "../../src/themes/tokyonight.ts"

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

describe("resolveStyleSlot", () => {
  test("inline Style object: returned as-is", () => {
    const s = { bold: true, fg: "primary" as const }
    expect(resolveStyleSlot(s, moon)).toBe(s)
  })

  test("string ref → Color slot: wrapped as { fg }", () => {
    // moon.primary = "#82aaff" (a Color shortcut)
    expect(resolveStyleSlot("primary", moon)).toEqual({ fg: "#82aaff" })
  })

  test("string ref → Style slot: returned directly", () => {
    const styleSlot = { bold: true, fg: "primary" as const, underline: true }
    const theme = { ...moon, mdHeading: styleSlot } as never
    expect(resolveStyleSlot("mdHeading", theme)).toBe(styleSlot)
  })

  test("unknown slot name: returns empty style (no throw)", () => {
    expect(resolveStyleSlot("doesNotExist", moon)).toEqual({})
  })

  test("undefined: returns empty style", () => {
    expect(resolveStyleSlot(undefined, moon)).toEqual({})
  })
})
