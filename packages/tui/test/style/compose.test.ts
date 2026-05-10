import { describe, expect, test } from "vitest"
import { reapplyStyle } from "../../src/style/ansi.ts"
import { resolveStyle } from "../../src/style/style.ts"
import { defaultTheme } from "../../src/themes/registry.ts"

describe("reapplyStyle", () => {
  const esc = "\x1b[48;2;255;0;0m"

  test("no resets: input unchanged", () => {
    expect(reapplyStyle("hello", esc)).toBe("hello")
  })

  test("single reset: style re-applied after", () => {
    expect(reapplyStyle("\x1b[38;2;0;0;255mhello\x1b[0mworld", esc)).toBe(
      `\x1b[38;2;0;0;255mhello\x1b[0m${esc}world`
    )
  })

  test("multiple resets: each gets style re-applied", () => {
    const input = "\x1b[0ma\x1b[0mb\x1b[0m"
    expect(reapplyStyle(input, esc)).toBe(`\x1b[0m${esc}a\x1b[0m${esc}b\x1b[0m${esc}`)
  })

  test("empty escape: input unchanged (guard)", () => {
    expect(reapplyStyle("\x1b[0mhello", "")).toBe("\x1b[0mhello")
  })
})

describe("resolveStyle", () => {
  test("inline Style object: returned as-is", () => {
    const s = { bold: true, fg: "primary" as const }
    expect(resolveStyle(s, defaultTheme)).toBe(s)
  })

  test("string ref → Color slot: wrapped as { fg }", () => {
    // moon.primary = "#82aaff" (a Color shortcut)
    expect(resolveStyle("primary", defaultTheme)).toEqual({ fg: "#82aaff" })
  })

  test("string ref → Style slot: returned directly", () => {
    const styleSlot = { bold: true, fg: "primary" as const, underline: true }
    const theme = { ...defaultTheme, mdHeading: styleSlot } as never
    expect(resolveStyle("mdHeading", theme)).toBe(styleSlot)
  })

  test("unknown string ref: treated as a fg color (resolved downstream)", () => {
    // Non-slot strings fall back to `{ fg: <ref> }` so callers like the
    // style builder can accept ANSI names (`"red"`), hex (`"#82aaff"`),
    // or anything else `colorParams` knows how to resolve.
    expect(resolveStyle("red", defaultTheme)).toEqual({ fg: "red" })
    expect(resolveStyle("#82aaff", defaultTheme)).toEqual({ fg: "#82aaff" })
  })

  test("undefined: returns empty style", () => {
    expect(resolveStyle(undefined, defaultTheme)).toEqual({})
  })

  test("no theme: still returns { fg } for any string ref", () => {
    expect(resolveStyle("red")).toEqual({ fg: "red" })
    expect(resolveStyle("primary")).toEqual({ fg: "primary" })
  })
})
