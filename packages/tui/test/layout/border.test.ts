import { describe, expect, test } from "vitest"
import { borders, drawBorder, resolveBorder } from "../../src/layout/border.ts"

describe("borders (presets)", () => {
  test("single preset uses box-drawing glyphs", () => {
    expect(borders.single).toEqual({
      bl: "└",
      br: "┘",
      h: "─",
      tl: "┌",
      tr: "┐",
      v: "│",
    })
  })

  test("rounded preset uses arc corners", () => {
    expect(borders.rounded.tl).toBe("╭")
    expect(borders.rounded.tr).toBe("╮")
    expect(borders.rounded.bl).toBe("╰")
    expect(borders.rounded.br).toBe("╯")
  })

  test("double preset uses double-line glyphs", () => {
    expect(borders.double.h).toBe("═")
    expect(borders.double.v).toBe("║")
  })
})

describe("resolveBorder", () => {
  test("undefined or false returns undefined", () => {
    expect(resolveBorder(undefined)).toBeUndefined()
    expect(resolveBorder(false)).toBeUndefined()
  })

  test("true returns single preset", () => {
    expect(resolveBorder(true)).toBe(borders.single)
  })

  test("named preset", () => {
    expect(resolveBorder("rounded")).toBe(borders.rounded)
    expect(resolveBorder("double")).toBe(borders.double)
  })

  test("custom BorderChars passes through", () => {
    const custom = { bl: "+", br: "+", h: "-", tl: "+", tr: "+", v: "|" }
    expect(resolveBorder(custom)).toBe(custom)
  })
})

describe("drawBorder", () => {
  test("no title: plain border around rows", () => {
    expect(drawBorder(["hello", "world"], borders.single)).toEqual([
      "┌─────┐",
      "│hello│",
      "│world│",
      "└─────┘",
    ])
  })

  test("empty content: still draws borders at min width 2 (tl+tr only)", () => {
    // Edge case: zero-width interior — caller shouldn't hit this but don't crash.
    expect(drawBorder([], borders.single)).toEqual(["┌┐", "└┘"])
  })

  test("single inner row", () => {
    expect(drawBorder(["x"], borders.rounded)).toEqual(["╭─╮", "│x│", "╰─╯"])
  })

  test("title renders on top row, left-aligned with space padding", () => {
    // Top row chrome: `tl + h + " " + title + " " + h*rest + tr`
    expect(drawBorder(["          "], borders.single, "hello")).toEqual([
      "┌─ hello ──┐",
      "│          │",
      "└──────────┘",
    ])
  })

  test("title too long: truncated with ellipsis", () => {
    // Interior = 6. Chrome is "h + space + space + h" = 4. So title budget = 6-4 = 2.
    // "hello" at budget 2 → "h…" (1 char + ellipsis)
    expect(drawBorder(["      "], borders.single, "hello")).toEqual([
      "┌─ h… ─┐",
      "│      │",
      "└──────┘",
    ])
  })

  test("exact-fit title: no truncation", () => {
    // Interior = 8, title budget = 4, title "abcd" fits exactly
    expect(drawBorder(["        "], borders.single, "abcd")).toEqual([
      "┌─ abcd ─┐",
      "│        │",
      "└────────┘",
    ])
  })
})
