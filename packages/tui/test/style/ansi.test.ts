import { hasAnsi, RESET, splitAnsi } from "@zaly/shared/ansi"
import { describe, expect, test } from "vitest"
import { hyperlink } from "../../src/style/ansi.ts"
import { openStyle } from "../../src/style/style.ts"
import { defaultTheme } from "../../src/themes/registry.ts"

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
    expect(openStyle({ fg: "primary" }, defaultTheme)).toBe("\x1b[38;2;130;170;255m")
  })

  test("non-slot names fall through to ANSI parsing", () => {
    expect(openStyle({ fg: "red" }, defaultTheme)).toBe("\x1b[31m")
  })

  test("without a theme, theme-only names silently drop", () => {
    expect(openStyle({ fg: "primary" })).toBe("")
  })
})

describe("splitAnsi", () => {
  test("plain single line → array with the input", () => {
    expect(splitAnsi("hello")).toEqual(["hello"])
  })

  test("plain multi-line → naive split", () => {
    expect(splitAnsi("a\nb\nc")).toEqual(["a", "b", "c"])
  })

  test("style that crosses newlines → closes + reopens around each break", () => {
    // bg span carries across two breaks; each line should end with the bg
    // closed and start (from line 2 onward) with it re-opened.
    const s = "\x1b[31mstart\nmiddle\nend\x1b[0m tail"
    const [l0, l1, l2] = splitAnsi(s)
    // Line 0 opens the fg + closes at cut
    expect(l0).toContain("\x1b[31m")
    expect(l0.endsWith("\x1b[39m")).toBe(true)
    // Line 1 re-opens + closes at next cut
    expect(l1.startsWith("\x1b[31m")).toBe(true)
    expect(l1.endsWith("\x1b[39m")).toBe(true)
    // Line 2 re-opens + preserves the natural reset at end of span
    expect(l2.startsWith("\x1b[31m")).toBe(true)
    expect(l2).toContain("\x1b[0m")
  })

  test("does not mangle content that already closes styles per line", () => {
    const s = "\x1b[31mhello\x1b[39m\n\x1b[31mworld\x1b[39m"
    const [l0, l1] = splitAnsi(s)
    expect(l0).toContain("hello")
    expect(l1).toContain("world")
  })
})

describe("hyperlink (OSC 8)", () => {
  test("wraps text with OSC 8 open/close for clickable terminals", () => {
    // OSC 8: ESC ] 8 ; ; URL ESC \ TEXT ESC ] 8 ; ; ESC \
    expect(hyperlink("https://example.com", "click me")).toBe(
      "\x1b]8;;https://example.com\x1b\\click me\x1b]8;;\x1b\\"
    )
  })

  test("preserves ANSI-styled text inside the hyperlink", () => {
    const styled = "\x1b[1mclick me\x1b[0m"
    expect(hyperlink("https://example.com", styled)).toBe(
      `\x1b]8;;https://example.com\x1b\\${styled}\x1b]8;;\x1b\\`
    )
  })

  test("empty URL: returns text unchanged (no-op)", () => {
    expect(hyperlink("", "text")).toBe("text")
  })
})

describe("hasAnsi", () => {
  test("detects SGR sequences", () => {
    expect(hasAnsi("\x1b[31mred\x1b[0m")).toBe(true)
    expect(hasAnsi("plain")).toBe(false)
  })
})
