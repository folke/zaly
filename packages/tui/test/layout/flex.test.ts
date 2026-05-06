import { describe, expect, test } from "vitest"
import { allocateRow, stackColumn, zipRow } from "../../src/layout/flex.ts"

describe("allocateRow", () => {
  test("empty items yields empty widths", () => {
    expect(allocateRow([], { contentWidth: 100, gap: 0 })).toEqual([])
  })

  test("single fixed-width item", () => {
    expect(allocateRow([{ width: 10 }], { contentWidth: 100, gap: 0 })).toEqual([10])
  })

  test("two fixed-width items", () => {
    expect(allocateRow([{ width: 10 }, { width: 20 }], { contentWidth: 100, gap: 0 })).toEqual([
      10, 20,
    ])
  })

  test("gap is subtracted from remaining when distributing to flex", () => {
    // contentWidth=10, gap=2 (1 gap between 2 items) → remaining = 8 for flex
    expect(allocateRow([{ width: 3 }, { flexGrow: 1 }], { contentWidth: 10, gap: 2 })).toEqual([
      3, 5,
    ])
  })

  test("flex items share remaining equally", () => {
    expect(allocateRow([{ flexGrow: 1 }, { flexGrow: 1 }], { contentWidth: 10, gap: 0 })).toEqual([
      5, 5,
    ])
  })

  test("flexGrow proportional distribution", () => {
    // 12 cells, grow ratios 1:2 → 4:8
    expect(allocateRow([{ flexGrow: 1 }, { flexGrow: 2 }], { contentWidth: 12, gap: 0 })).toEqual([
      4, 8,
    ])
  })

  test("items without width or flexGrow stay at natural basis (CSS flex: 0 1 auto)", () => {
    // No grow weight → no slack distribution. Bare items collapse to
    // 0 (their default basis); siblings don't claim the leftover.
    expect(allocateRow([{}, {}, {}], { contentWidth: 12, gap: 0 })).toEqual([0, 0, 0])
  })

  test("natural basis is used when no fixed width is given", () => {
    expect(allocateRow([{ natural: 3 }, { natural: 5 }], { contentWidth: 20, gap: 0 })).toEqual([
      3, 5,
    ])
  })

  test("flexGrow absorbs slack on top of natural basis", () => {
    expect(
      allocateRow([{ natural: 2 }, { flexGrow: 1, natural: 4 }], { contentWidth: 10, gap: 0 })
    ).toEqual([2, 8])
  })

  test("'fill' width acts as flex weight 1", () => {
    expect(allocateRow([{ width: "fill" }, { width: 4 }], { contentWidth: 10, gap: 0 })).toEqual([
      6, 4,
    ])
  })

  test("percent width is fixed", () => {
    expect(allocateRow([{ width: "50%" }, { flexGrow: 1 }], { contentWidth: 10, gap: 0 })).toEqual([
      5, 5,
    ])
  })

  test("minWidth clamps up", () => {
    expect(
      allocateRow([{ flexGrow: 1, minWidth: 6 }, { flexGrow: 1 }], {
        contentWidth: 10,
        gap: 0,
      })
    ).toEqual([6, 4])
  })

  test("maxWidth clamps down; extra space flows to last flex sibling", () => {
    // CSS-flex-style: space freed by max-clamp is absorbed by the tail flex.
    expect(
      allocateRow([{ flexGrow: 1, maxWidth: 3 }, { flexGrow: 1 }], {
        contentWidth: 10,
        gap: 0,
      })
    ).toEqual([3, 7])
  })

  test("remainder rounding: tail child absorbs remainder", () => {
    // 10 / 3 = 3.33 → [3, 3, 4] so total sums to contentWidth
    expect(
      allocateRow([{ flexGrow: 1 }, { flexGrow: 1 }, { flexGrow: 1 }], {
        contentWidth: 10,
        gap: 0,
      })
    ).toEqual([3, 3, 4])
  })
})

describe("zipRow", () => {
  test("empty children yields empty rows", () => {
    expect(zipRow([], { gap: 0, widths: [] })).toEqual([])
  })

  test("single child passes through", () => {
    expect(zipRow([["abc"]], { gap: 0, widths: [3] })).toEqual(["abc"])
  })

  test("two children same height, no gap, concatenated per row", () => {
    expect(
      zipRow(
        [
          ["a", "b"],
          ["x", "y"],
        ],
        { gap: 0, widths: [1, 1] }
      )
    ).toEqual(["ax", "by"])
  })

  test("gap inserts spaces between children on each row", () => {
    expect(zipRow([["a"], ["b"]], { gap: 2, widths: [1, 1] })).toEqual(["a  b"])
  })

  test("height alignment: shorter children padded with blank rows of their width", () => {
    // child0 height=3, child1 height=1 → child1 padded to 3 with two blanks
    expect(zipRow([["a1", "a2", "a3"], ["b1"]], { gap: 1, widths: [2, 2] })).toEqual([
      "a1 b1",
      "a2   ",
      "a3   ",
    ])
  })
})

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

  test("empty children are skipped, including their surrounding gap", () => {
    // Middle child is empty (e.g. a hidden `show()` branch). The gap
    // collapses too — no stray blank band between the visible siblings.
    expect(stackColumn([["a   "], [], ["b   "]], { gap: 1, width: 4 })).toEqual([
      "a   ",
      "    ",
      "b   ",
    ])
  })

  test("leading/trailing empty children don't emit gaps either", () => {
    expect(stackColumn([[], ["x   "], []], { gap: 2, width: 4 })).toEqual(["x   "])
  })
})
