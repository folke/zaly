import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test, vi } from "vitest"
import { Box } from "../../src/nodes/box.ts"
import { Text } from "../../src/nodes/text.ts"
import { tokyoNightMoon } from "../../src/themes/tokyonight-moon.ts"

const ctx = (width: number): RenderCtx => ({ theme: tokyoNightMoon, width })

describe("Box — children management", () => {
  test("starts with empty children", () => {
    const b = new Box({})
    expect(b.children).toEqual([])
  })

  test("add pushes child and sets parent", () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    b.add(t)
    expect(b.children).toEqual([t])
    expect(t.parent).toBe(b)
  })

  test("add emits childadded", () => {
    const b = new Box({})
    const fn = vi.fn()
    b.on("childadded", fn)
    const t = new Text({ content: "hi" })
    b.add(t)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(t)
  })

  test("remove emits childremoved and clears parent", () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    b.add(t)
    const fn = vi.fn()
    b.on("childremoved", fn)
    b.remove(t)
    expect(b.children).toEqual([])
    expect(t.parent).toBeUndefined()
    expect(fn).toHaveBeenCalledWith(t)
  })

  test("remove ignores unknown child", () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    expect(() => b.remove(t)).not.toThrow()
  })

  test("clear removes all children", () => {
    const b = new Box({})
    const t1 = new Text({ content: "a" })
    const t2 = new Text({ content: "b" })
    b.add(t1).add(t2)
    b.clear()
    expect(b.children).toEqual([])
    expect(t1.parent).toBeUndefined()
    expect(t2.parent).toBeUndefined()
  })

  test("child mutation invalidates the parent box after box has rendered", () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    b.add(t)
    b.render(ctx(10))
    const fn = vi.fn()
    b.on("invalidate", fn)
    t.state.content = "bye"
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("Box — column layout (default)", () => {
  test("empty box at full width", () => {
    expect(new Box({}).render(ctx(5))).toEqual([])
  })

  test("stacks text children vertically, filling width", () => {
    const b = new Box({})
    b.add(new Text({ content: "hello" }))
    b.add(new Text({ content: "world" }))
    expect(b.render(ctx(10))).toEqual(["hello     ", "world     "])
  })

  test("gap inserts blank rows between children", () => {
    const b = new Box({ gap: 1 })
    b.add(new Text({ content: "a" }))
    b.add(new Text({ content: "b" }))
    expect(b.render(ctx(5))).toEqual(["a    ", "     ", "b    "])
  })
})

describe("Box — padding", () => {
  test("uniform padding: number", () => {
    const b = new Box({ padding: 1 })
    b.add(new Text({ content: "hi" }))
    expect(b.render(ctx(6))).toEqual(["      ", " hi   ", "      "])
  })

  test("vertical/horizontal padding: [v, h]", () => {
    const b = new Box({ padding: [1, 2] })
    b.add(new Text({ content: "hi" }))
    expect(b.render(ctx(8))).toEqual(["        ", "  hi    ", "        "])
  })

  test("per-side padding: [t, r, b, l]", () => {
    const b = new Box({ padding: [1, 2, 0, 3] })
    b.add(new Text({ content: "x" }))
    expect(b.render(ctx(10))).toEqual(["          ", "   x      "])
  })
})

describe("Box — border", () => {
  test("border: true uses single-line preset", () => {
    const b = new Box({ border: true })
    b.add(new Text({ content: "hi" }))
    expect(b.render(ctx(6))).toEqual(["┌────┐", "│hi  │", "└────┘"])
  })

  test("border rounded with title", () => {
    const b = new Box({ border: "rounded", borderTitle: "hi" })
    b.add(new Text({ content: "body" }))
    expect(b.render(ctx(10))).toEqual(["╭─ hi ───╮", "│body    │", "╰────────╯"])
  })

  test("border + padding", () => {
    const b = new Box({ border: true, padding: 1 })
    b.add(new Text({ content: "x" }))
    expect(b.render(ctx(7))).toEqual(["┌─────┐", "│     │", "│ x   │", "│     │", "└─────┘"])
  })
})

describe("Box — row layout", () => {
  test("two text children share width equally", () => {
    const b = new Box({ flexDirection: "row" })
    b.add(new Text({ content: "aaaa" }))
    b.add(new Text({ content: "bbbb" }))
    expect(b.render(ctx(10))).toEqual(["aaaa bbbb "])
  })

  test("gap between row children; slack pads to box inner width", () => {
    const b = new Box({ flexDirection: "row", gap: 2 })
    b.add(new Text({ content: "a", width: 3 }))
    b.add(new Text({ content: "b", width: 3 }))
    // outer=10, fixed+gap = 3+2+3 = 8, 2 trailing slack cells pad the row.
    expect(b.render(ctx(10))).toEqual(["a    b    "])
  })

  test("different heights: shorter child padded with blanks", () => {
    const b = new Box({ flexDirection: "row" })
    b.add(new Text({ content: "a\nb\nc", width: 2 }))
    b.add(new Text({ content: "x", width: 2 }))
    expect(b.render(ctx(4))).toEqual(["a x ", "b   ", "c   "])
  })
})

describe("Box — style", () => {
  test("fg applied to each row", () => {
    const b = new Box({ fg: "red" })
    b.add(new Text({ content: "x" }))
    expect(b.render(ctx(3))).toEqual(["\x1b[31mx  \x1b[0m"])
  })

  test("bg reapplies after child's own reset", () => {
    // Width-1 child inside a 3-wide box: after the child's reset the Box's
    // trailing slack padding must carry the bg, so the reset needs to be
    // followed by a bg-re-apply.
    const b = new Box({ bg: "#0000ff" })
    b.add(new Text({ content: "x", fg: "red", width: 1 }))
    const out = b.render(ctx(3))
    expect(out).toHaveLength(1)
    expect(out[0]).toBe("\x1b[48;2;0;0;255m\x1b[31mx\x1b[0m\x1b[48;2;0;0;255m  \x1b[0m")
  })
})
