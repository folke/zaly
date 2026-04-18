import { describe, expect, test } from "vitest"
import { openStyle, RESET } from "../../src/style/ansi.ts"
import { moon } from "../../src/themes/tokyonight.ts"

describe("openStyle", () => {
  test("empty style emits nothing", () => {
    expect(openStyle({})).toBe("")
  })

  test("truecolor fg", () => {
    // 130,170,255 is #82aaff
    expect(openStyle({ fg: "#82aaff" })).toBe("\x1b[38;2;130;170;255m")
  })

  test("truecolor bg", () => {
    expect(openStyle({ bg: "#82aaff" })).toBe("\x1b[48;2;130;170;255m")
  })

  test("fg + bg combined into a single SGR run", () => {
    expect(openStyle({ bg: "#0000ff", fg: "#ff0000" })).toBe("\x1b[38;2;255;0;0;48;2;0;0;255m")
  })

  test("bold attribute", () => {
    expect(openStyle({ bold: true })).toBe("\x1b[1m")
  })

  test("all six attributes combine", () => {
    expect(
      openStyle({
        bold: true,
        dim: true,
        inverse: true,
        italic: true,
        strikethrough: true,
        underline: true,
      })
    ).toBe("\x1b[1;2;3;4;7;9m")
  })

  test("attribute false is skipped", () => {
    expect(openStyle({ bold: true, italic: false })).toBe("\x1b[1m")
  })

  test("attributes + fg + bg in a single SGR run", () => {
    expect(openStyle({ bg: "#0000ff", bold: true, fg: "#ff0000" })).toBe(
      "\x1b[1;38;2;255;0;0;48;2;0;0;255m"
    )
  })

  test("ANSI name emits SGR code directly", () => {
    expect(openStyle({ fg: "red" })).toBe("\x1b[31m")
    expect(openStyle({ bg: "blue" })).toBe("\x1b[44m")
  })

  test("bright ANSI variant emits 90-series", () => {
    expect(openStyle({ fg: "brightRed" })).toBe("\x1b[91m")
    expect(openStyle({ bg: "brightBlue" })).toBe("\x1b[104m")
  })

  test("gray / grey alias to brightBlack", () => {
    expect(openStyle({ fg: "gray" })).toBe("\x1b[90m")
    expect(openStyle({ fg: "grey" })).toBe("\x1b[90m")
  })

  test("ANSI fg + hex bg combine into one run", () => {
    expect(openStyle({ bg: "#0000ff", fg: "red" })).toBe("\x1b[31;48;2;0;0;255m")
  })

  test("invalid fg drops silently (acts like inherit)", () => {
    // Values reaching runtime via non-TS callers / casts should be tolerated.
    expect(openStyle({ fg: "not-a-color" as never })).toBe("")
    expect(openStyle({ bg: "not-a-color" as never })).toBe("")
  })

  test("'inherit' sentinel drops silently", () => {
    expect(openStyle({ fg: "inherit" })).toBe("")
    expect(openStyle({ bold: true, fg: "inherit" })).toBe("\x1b[1m")
  })

  test("attribute order is stable: attrs, then fg, then bg", () => {
    // attrs are emitted before fg/bg regardless of input order
    expect(openStyle({ bold: true, fg: "red" })).toBe("\x1b[1;31m")
  })

  test("RESET is the full reset sequence", () => {
    expect(RESET).toBe("\x1b[0m")
  })

  test("theme color slots resolve when a theme is passed", () => {
    // moon.primary = '#82aaff' → [130,170,255]
    expect(openStyle({ fg: "primary" }, moon)).toBe("\x1b[38;2;130;170;255m")
  })

  test("non-slot names fall through to ANSI parsing", () => {
    expect(openStyle({ fg: "red" }, moon)).toBe("\x1b[31m")
  })

  test("without a theme, theme-only names silently drop", () => {
    expect(openStyle({ fg: "primary" })).toBe("")
  })
})
