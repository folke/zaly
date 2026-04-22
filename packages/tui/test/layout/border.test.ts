import { describe, expect, test } from "vitest"
import { borders, drawBorder, resolveBorder } from "../../src/layout/border.ts"
import { style } from "../../src/style/builder.ts"
import { defaultTheme } from "../../src/style/theme.ts"

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
    expect(drawBorder(["          "], borders.single, { title: "hello" })).toEqual([
      "┌─ hello ──┐",
      "│          │",
      "└──────────┘",
    ])
  })

  test("title too long: truncated with ellipsis", () => {
    // Interior = 6. Chrome is "h + space + space + h" = 4. So title budget = 6-4 = 2.
    // "hello" at budget 2 → "h…" (1 char + ellipsis)
    expect(drawBorder(["      "], borders.single, { title: "hello" })).toEqual([
      "┌─ h… ─┐",
      "│      │",
      "└──────┘",
    ])
  })

  test("exact-fit title: no truncation", () => {
    // Interior = 8, title budget = 4, title "abcd" fits exactly
    expect(drawBorder(["        "], borders.single, { title: "abcd" })).toEqual([
      "┌─ abcd ─┐",
      "│        │",
      "└────────┘",
    ])
  })

  test("title align: left (default)", () => {
    // inner 10, budget 6, title "hi" (2) → leading 1, trailing 5
    expect(drawBorder(["          "], borders.single, { title: "hi" })).toEqual([
      "┌─ hi ─────┐",
      "│          │",
      "└──────────┘",
    ])
  })

  test("title align: right", () => {
    // inner 10, budget 6, title "hi" (2) → leading 5, trailing 1
    expect(
      drawBorder(["          "], borders.single, { title: "hi", titleAlign: "right" })
    ).toEqual(["┌───── hi ─┐", "│          │", "└──────────┘"])
  })

  test("title align: center", () => {
    // inner 10, budget 6, title "hi" (2), slack = 4 → 2 each side (balanced)
    expect(
      drawBorder(["          "], borders.single, { title: "hi", titleAlign: "center" })
    ).toEqual(["┌─── hi ───┐", "│          │", "└──────────┘"])
  })

  test("title align: center with odd slack rounds leading down", () => {
    // inner 9, total h-cells = inner - 2 - len("hi") = 5 → leading 2, trailing 3
    expect(
      drawBorder(["         "], borders.single, { title: "hi", titleAlign: "center" })
    ).toEqual(["┌── hi ───┐", "│         │", "└─────────┘"])
  })

  test("borderStyle wraps border chars with SGR", () => {
    // primary = #82aaff → 38;2;130;170;255
    const out = drawBorder(["x"], borders.single, {
      borderStyle: style(defaultTheme).fg("primary"),
    })
    // Each border-char segment is wrapped; side chars on row 1 flank the content.
    expect(out[0]).toBe("\x1b[38;2;130;170;255m┌─┐\x1b[0m")
    expect(out[1]).toBe("\x1b[38;2;130;170;255m│\x1b[0mx\x1b[38;2;130;170;255m│\x1b[0m")
    expect(out[2]).toBe("\x1b[38;2;130;170;255m└─┘\x1b[0m")
  })

  test("titleStyle overrides borderStyle for the title region", () => {
    const out = drawBorder(["      "], borders.single, {
      borderStyle: style(defaultTheme).fg("primary"),
      title: "hi",
      titleStyle: style(defaultTheme).bold.fg("accent"),
    })
    // Derive the expected escapes from the actual theme values so this test
    // stays stable when the theme palette changes.
    const primary = hexToTruecolor(defaultTheme.primary as string, "fg")
    const accent = hexToTruecolor(defaultTheme.accent as string, "fg")
    expect(out[0]).toBe(
      // oxlint-disable-next-line no-useless-concat
      `\x1b[${primary}m┌─\x1b[0m` + `\x1b[1;${accent}m hi \x1b[0m` + `\x1b[${primary}m─┐\x1b[0m`
    )
  })
})

// Convert a #rrggbb or #rgb hex value into the SGR params emitted by
// `colorParams` — e.g. "#82aaff" → "38;2;130;170;255".
function hexToTruecolor(hex: string, kind: "fg" | "bg"): string {
  const h = hex.startsWith("#") ? hex.slice(1) : hex
  const full = h.length === 3 ? h.replaceAll(/./g, "$&$&") : h
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return `${kind === "fg" ? 38 : 48};2;${r};${g};${b}`
}
