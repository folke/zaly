import { describe, expect, test } from "vitest"
import { sliceAnsi, stringWidth, wrapAnsi } from "@zaly/shared/ansi"

describe("stringWidth", () => {
  test("ascii width equals length", () => {
    expect(stringWidth("hello")).toBe(5)
  })

  test("ignores ANSI escapes", () => {
    expect(stringWidth("\x1b[31mhello\x1b[0m")).toBe(5)
  })

  test("empty string is width 0", () => {
    expect(stringWidth("")).toBe(0)
  })

  test("wide characters count as 2", () => {
    expect(stringWidth("日本")).toBe(4)
  })

  test("APC sequences contribute 0 width (invisible side-channel)", () => {
    // Kitty graphics transmit is APC: ESC _ G...payload... ESC \
    // The terminal consumes the bytes silently — they must not count as
    // visible width or layout will slice into them and corrupt the payload.
    const apc = "\x1b_Ga=T,U=1,i=1,f=100;iVBORw0KGgo=\x1b\\"
    expect(stringWidth(apc)).toBe(0)
    expect(stringWidth(`${apc}hello`)).toBe(5)
  })
})

describe("wrapAnsi (word mode, default)", () => {
  test("wraps at word boundaries; inter-word spaces stay on the line they belong to", () => {
    // `trim: false` preserves structural whitespace — the inter-word spaces
    // that would have ended a line stick there rather than being swallowed.
    // Structural integrity matters more than cosmetic cleanup for a TUI.
    expect(wrapAnsi("hello world and one more", 10)).toBe("hello \nworld and \none more")
  })

  test("splits up long words in word mode", () => {
    expect(wrapAnsi("supercalifragilistic", 5)).toBe("super\ncalif\nragil\nistic")
  })

  test("short input fits in one row", () => {
    expect(wrapAnsi("one", 10)).toBe("one")
  })

  test("empty string yields an empty string", () => {
    expect(wrapAnsi("", 10)).toBe("")
  })
})

describe("wrapAnsi (char mode)", () => {
  test("hard-breaks long words at width", () => {
    expect(wrapAnsi("supercalifragilistic", 5, { mode: "char" })).toBe("super\ncalif\nragil\nistic")
  })
})

describe("sliceAnsi", () => {
  test("preserves ANSI escapes while slicing by display width", () => {
    expect(sliceAnsi("\x1b[31mhello\x1b[0m world", 0, 8)).toBe("\x1b[31mhello\x1b[0m wo")
  })

  test("slice beyond content returns whole string", () => {
    expect(sliceAnsi("\x1b[1mhi\x1b[0m", 0, 10)).toBe("\x1b[1mhi\x1b[0m")
  })

  test("cutting inside a styled region emits a category-specific reset", () => {
    // Both runtimes emit \x1b[39m (fg-default) rather than a full \x1b[0m,
    // which is ideal — bg / attrs outside the cut remain untouched.
    expect(sliceAnsi("\x1b[31mabcdef\x1b[0m", 2, 5)).toBe("\x1b[31mcde\x1b[39m")
  })

  test("plain-text slice matches .slice semantics", () => {
    expect(sliceAnsi("hello world", 0, 5)).toBe("hello")
  })

  test("APC sequences survive slicing (preserved at row start)", () => {
    // The KGP transmit APC has 0 display width but must not be lost when a
    // row containing it gets sliced by box layout — otherwise the image
    // bytes never reach the terminal.
    const apc = "\x1b_Gi=1;payload\x1b\\"
    const sliced = sliceAnsi(`${apc}hello world`, 0, 5)
    expect(sliced).toContain(apc)
    expect(sliced).toContain("hello")
  })
})
