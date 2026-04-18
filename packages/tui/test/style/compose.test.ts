import { describe, expect, test } from "vitest"
import { reapplyBg, resolveStyle } from "../../src/style/compose.ts"
import { moon } from "../../src/style/theme.ts"

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

describe("resolveStyle", () => {
  test("inline Style object: returned as-is", () => {
    const s = { bold: true, fg: "primary" as const }
    expect(resolveStyle(s, moon)).toBe(s)
  })

  test("string ref → Color slot: wrapped as { fg }", () => {
    // moon.primary = "#82aaff" (a Color shortcut)
    expect(resolveStyle("primary", moon)).toEqual({ fg: "#82aaff" })
  })

  test("string ref → Style slot: returned directly", () => {
    const styleSlot = { bold: true, fg: "primary" as const, underline: true }
    const theme = { ...moon, mdHeading: styleSlot } as never
    expect(resolveStyle("mdHeading", theme)).toBe(styleSlot)
  })

  test("unknown string ref: treated as a fg color (resolved downstream)", () => {
    // Non-slot strings fall back to `{ fg: <ref> }` so callers like the
    // style builder can accept ANSI names (`"red"`), hex (`"#82aaff"`),
    // or anything else `colorParams` knows how to resolve.
    expect(resolveStyle("red", moon)).toEqual({ fg: "red" })
    expect(resolveStyle("#82aaff", moon)).toEqual({ fg: "#82aaff" })
  })

  test("undefined: returns empty style", () => {
    expect(resolveStyle(undefined, moon)).toEqual({})
  })

  test("no theme: still returns { fg } for any string ref", () => {
    expect(resolveStyle("red")).toEqual({ fg: "red" })
    expect(resolveStyle("primary")).toEqual({ fg: "primary" })
  })
})
