import { describe, expect, test } from "vitest"
import {
  fitAnsi,
  hasAnsi,
  sliceAnsi,
  splitAnsi,
  stringWidth,
  stripAnsi,
  truncateAnsi,
  wrapAnsi,
} from "../src/ansi.ts"

describe("ANSI primitives", () => {
  test("stringWidth ignores APC escape payloads", () => {
    expect(stringWidth("\x1b_image-data\x1b\\hello")).toBe(5)
  })

  test("stripAnsi removes control sequences", () => {
    const text = "\x1b]8;;https://example.com\x07\x1b[31mred\x1b[0m\x1b[2K\x1b_hidden\x1b\\"
    expect(stripAnsi(text)).toBe("red")
  })

  test("stripAnsi keepStyles preserves SGR but drops other controls", () => {
    expect(stripAnsi("\x1b[31mred\x1b[2K\x1b[0m", { keepStyles: true })).toBe("\x1b[31mred\x1b[0m")
  })

  test("sliceAnsi preserves APC payloads while slicing visible cells", () => {
    expect(sliceAnsi("\x1b_apc\x1b\\abcdef", 1, 4)).toBe("\x1b_apc\x1b\\bcd")
  })

  test("wrapAnsi preserves line-local APC payloads", () => {
    expect(wrapAnsi("\x1b_a\x1b\\hello world", 5, { mode: "char" }).split("\n")[0]).toBe(
      "\x1b_a\x1b\\hello"
    )
  })

  test("wrapAnsi preserves OSC 8 hyperlinks across wrapped rows", () => {
    const url =
      "https://example.com/docs?first=abcdefghijklmnopqrstuvwxyz&second=0123456789abcdefghijklmnopqrstuvwxyz&third=abcdefghijklmnop"
    const linked = `\x1b]8;;${url}\x1b\\${url}\x1b]8;;\x1b\\`
    const rows = wrapAnsi(`See ${linked} for details.`, 40).split("\n")
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.every((row) => stringWidth(row) <= 40)).toBe(true)
    expect(rows.filter((row) => row.includes(url)).length).toBeGreaterThan(1)
    expect(rows.map((row) => stripAnsi(row)).join("")).toBe(`See ${url} for details.`)
  })

  test("wrapAnsi preserves a hyperlink's BEL terminator", () => {
    const url = "https://example.com/abcdefghijklmnopqrstuvwxyz"
    const linked = `\x1b]8;;${url}\x07${url}\x1b]8;;\x07`
    const rows = wrapAnsi(linked, 12).split("\n")
    expect(rows.every((row) => row.includes(`\x1b]8;;${url}\x07`))).toBe(true)
    expect(rows.every((row) => row.endsWith("\x1b]8;;\x07"))).toBe(true)
  })

  test("hasAnsi detects SGR escapes only", () => {
    expect(hasAnsi("\x1b[31mred")).toBe(true)
    expect(hasAnsi("\x1b[2Kclear")).toBe(false)
  })

  test("truncateAnsi and fitAnsi size strings to visible width", () => {
    expect(truncateAnsi("abcdef", 4)).toBe("abc…")
    expect(fitAnsi("abc", 5)).toBe("abc  ")
    expect(fitAnsi("abc", 3)).toBe("abc")
    expect(fitAnsi("abcdef", 4)).toBe("abc…")
  })
})

describe("splitAnsi", () => {
  test("splits plain strings", () => {
    expect(splitAnsi("a\nb\n")).toEqual(["a", "b", ""])
  })

  test("closes and reopens foreground across lines", () => {
    expect(splitAnsi("\x1b[31mfoo\nbar\x1b[0m")).toEqual([
      "\x1b[31mfoo\x1b[39m",
      "\x1b[31mbar\x1b[0m",
    ])
  })

  test("closes and reopens multiple styles across lines", () => {
    expect(splitAnsi("\x1b[31;44mfoo\nbar\x1b[0m")).toEqual([
      "\x1b[31m\x1b[44mfoo\x1b[49m\x1b[39m",
      "\x1b[31m\x1b[44mbar\x1b[0m",
    ])
  })

  test("preserves non-color sgr state across lines", () => {
    expect(splitAnsi("\x1b[1mfoo\nbar\x1b[22m")).toEqual([
      "\x1b[1mfoo\x1b[22m",
      "\x1b[1mbar\x1b[22m",
    ])
  })

  test("keeps explicit line-ending reset", () => {
    expect(splitAnsi("\x1b[31mfoo\x1b[39m\nbar")).toEqual(["\x1b[31mfoo\x1b[39m", "bar"])
  })

  test("keeps plain text content", () => {
    expect(splitAnsi("\x1b[31mfoo\nbar\x1b[0m").map((row) => stripAnsi(row))).toEqual([
      "foo",
      "bar",
    ])
  })
})
