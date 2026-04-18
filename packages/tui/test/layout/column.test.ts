import { describe, expect, test } from "vitest"
import { stackColumn } from "../../src/layout/column.ts"

describe("stackColumn", () => {
  test("empty children returns empty rows", () => {
    expect(stackColumn([], { gap: 0, width: 10 })).toEqual([])
  })

  test("single child returns its rows", () => {
    expect(stackColumn([["hello     "]], { gap: 0, width: 10 })).toEqual(["hello     "])
  })

  test("two children with no gap: flattened", () => {
    expect(
      stackColumn([["aaaa      "], ["bbbb      ", "cccc      "]], { gap: 0, width: 10 })
    ).toEqual(["aaaa      ", "bbbb      ", "cccc      "])
  })

  test("two children with gap=1 inserts a blank row between", () => {
    expect(stackColumn([["aaaa      "], ["bbbb      "]], { gap: 1, width: 10 })).toEqual([
      "aaaa      ",
      "          ",
      "bbbb      ",
    ])
  })

  test("three children with gap=2 inserts 2 blank rows between each pair", () => {
    expect(stackColumn([["a    "], ["b    "], ["c    "]], { gap: 2, width: 5 })).toEqual([
      "a    ",
      "     ",
      "     ",
      "b    ",
      "     ",
      "     ",
      "c    ",
    ])
  })

  test("no trailing gap after last child", () => {
    const out = stackColumn([["x   "], ["y   "]], { gap: 1, width: 4 })
    expect(out[out.length - 1]).toBe("y   ")
  })
})
