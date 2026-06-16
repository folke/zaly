import { describe, expect, test } from "vitest"
import { splitAnsi, stripAnsi } from "../src/ansi.ts"

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
