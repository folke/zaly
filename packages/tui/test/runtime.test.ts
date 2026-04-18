import { sliceAnsi, stringWidth, wrapAnsi } from "#runtime"
import { describe, expect, test } from "vitest"

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
})

describe("wrapAnsi (word mode, default)", () => {
  test("wraps at word boundaries", () => {
    expect(wrapAnsi("hello world and one more", 10)).toEqual(["hello", "world and", "one more"])
  })

  test("keeps long words intact in word mode", () => {
    expect(wrapAnsi("supercalifragilistic", 5)).toEqual(["supercalifragilistic"])
  })

  test("short input fits in one row", () => {
    expect(wrapAnsi("one", 10)).toEqual(["one"])
  })

  test("empty string yields a single empty row", () => {
    expect(wrapAnsi("", 10)).toEqual([""])
  })
})

describe("wrapAnsi (char mode)", () => {
  test("hard-breaks long words at width", () => {
    expect(wrapAnsi("supercalifragilistic", 5, { mode: "char" })).toEqual([
      "super",
      "calif",
      "ragil",
      "istic",
    ])
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
})
