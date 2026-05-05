import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { openStyle, RESET } from "../../src/style/ansi.ts"
import { resolveStyle } from "../../src/style/color.ts"
import { defaultTheme } from "../../src/themes/index.ts"
import { Box } from "../../src/widgets/box.ts"
import { Text } from "../../src/widgets/text.ts"

const ctx = (width: number) => createCtx({ width })

describe("Box — children management", () => {
  test("starts with empty children", async () => {
    const b = new Box({})
    expect(b.children).toEqual([])
  })

  test("add pushes child and sets parent", async () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    b.add(t)
    expect(b.children).toEqual([t])
    expect(t.parent).toBe(b)
  })

  test("add emits childadded", async () => {
    const b = new Box({})
    const fn = vi.fn()
    b.on("childadded", fn)
    const t = new Text({ content: "hi" })
    b.add(t)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith({ child: t, type: "childadded" }, expect.anything())
  })

  test("remove emits childremoved and clears parent", async () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    b.add(t)
    const fn = vi.fn()
    b.on("childremoved", fn)
    b.remove(t)
    expect(b.children).toEqual([])
    expect(t.parent).toBeUndefined()
    expect(fn).toHaveBeenCalledWith({ child: t, type: "childremoved" }, expect.anything())
  })

  test("remove ignores unknown child", async () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    expect(() => b.remove(t)).not.toThrow()
  })

  test("clear removes all children", async () => {
    const b = new Box({})
    const t1 = new Text({ content: "a" })
    const t2 = new Text({ content: "b" })
    b.add(t1).add(t2)
    b.clear()
    expect(b.children).toEqual([])
    expect(t1.parent).toBeUndefined()
    expect(t2.parent).toBeUndefined()
  })

  test("child mutation invalidates the parent box after box has rendered", async () => {
    const b = new Box({})
    const t = new Text({ content: "hi" })
    b.add(t)
    await b.render(ctx(10))
    const fn = vi.fn()
    b.on("invalidate", fn)
    t.state.content = "bye"
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("Box — column layout (default)", () => {
  test("empty box at full width", async () => {
    expect(await new Box({}).render(ctx(5))).toEqual([])
  })

  test("stacks text children vertically, filling width", async () => {
    const b = new Box({})
    b.add(new Text({ content: "hello" }))
    b.add(new Text({ content: "world" }))
    expect(await b.render(ctx(10))).toEqual(["hello     ", "world     "])
  })

  test("gap inserts blank rows between children", async () => {
    const b = new Box({ gap: 1 })
    b.add(new Text({ content: "a" }))
    b.add(new Text({ content: "b" }))
    expect(await b.render(ctx(5))).toEqual(["a    ", "     ", "b    "])
  })
})

describe("Box — padding", () => {
  test("uniform padding: number", async () => {
    const b = new Box({ padding: 1 })
    b.add(new Text({ content: "hi" }))
    expect(await b.render(ctx(6))).toEqual(["      ", " hi   ", "      "])
  })

  test("vertical/horizontal padding: [v, h]", async () => {
    const b = new Box({ padding: [1, 2] })
    b.add(new Text({ content: "hi" }))
    expect(await b.render(ctx(8))).toEqual(["        ", "  hi    ", "        "])
  })

  test("per-side padding: [t, r, b, l]", async () => {
    const b = new Box({ padding: [1, 2, 0, 3] })
    b.add(new Text({ content: "x" }))
    expect(await b.render(ctx(10))).toEqual(["          ", "   x      "])
  })
})

describe("Box — border", () => {
  test("border: true uses single-line preset", async () => {
    // Empty borderStyle opts out of the default "border" slot so the glyphs
    // read unadorned — layout is the thing under test here.
    const b = new Box({ border: true, borderStyle: {} })
    b.add(new Text({ content: "hi" }))
    expect(await b.render(ctx(6))).toEqual(["┌────┐", "│hi  │", "└────┘"])
  })

  test("border rounded with title", async () => {
    const b = new Box({
      border: "rounded",
      borderStyle: {},
      borderTitle: "hi",
      borderTitleStyle: {},
    })
    b.add(new Text({ content: "body" }))
    expect(await b.render(ctx(10))).toEqual(["╭─ hi ───╮", "│body    │", "╰────────╯"])
  })

  test("border + padding", async () => {
    const b = new Box({ border: true, borderStyle: {}, padding: 1 })
    b.add(new Text({ content: "x" }))
    expect(await b.render(ctx(7))).toEqual(["┌─────┐", "│     │", "│ x   │", "│     │", "└─────┘"])
  })

  test("borderStyle defaults to the theme's `border` slot", async () => {
    // Derive expected escapes from the active theme so the test survives
    // palette tweaks (moon's border color is generated, not hand-picked).
    const b = new Box({ border: true })
    b.add(new Text({ content: "hi" }))
    const out = await b.render(ctx(6))
    const borderOpen = openStyle(resolveStyle("border", defaultTheme), defaultTheme)
    expect(out[0]).toBe(`${borderOpen}┌────┐${RESET}`)
    expect(out[1]).toBe(`${borderOpen}│${RESET}hi  ${borderOpen}│${RESET}`)
    expect(out[2]).toBe(`${borderOpen}└────┘${RESET}`)
  })

  test("borderTitleAlign centers the title", async () => {
    const b = new Box({
      border: true,
      borderStyle: {},
      borderTitle: "hi",
      borderTitleAlign: "center",
      borderTitleStyle: {},
    })
    b.add(new Text({ content: "body" }))
    // outer 10, inner 8, total h = 8 - 2 - 2 = 4 → leading 2, trailing 2
    const rows = await b.render(ctx(10))
    expect(rows[0]).toBe("┌── hi ──┐")
  })

  test("borderTitleAlign: right", async () => {
    const b = new Box({
      border: true,
      borderStyle: {},
      borderTitle: "hi",
      borderTitleAlign: "right",
      borderTitleStyle: {},
    })
    b.add(new Text({ content: "body" }))
    // inner 8, total h = 4 → leading 3, trailing 1
    const rows = await b.render(ctx(10))
    expect(rows[0]).toBe("┌─── hi ─┐")
  })

  test("borderTitleStyle defaults to theme `borderTitle` slot", async () => {
    // moon.borderTitle = { bold: true, fg: "primary" } → 1;38;2;130;170;255
    const b = new Box({ border: true, borderStyle: {}, borderTitle: "hi" })
    b.add(new Text({ content: "body" }))
    const out = await b.render(ctx(10))
    // Top row: unstyled border-prefix + styled title + unstyled border-suffix.
    // inner = 8, budget = 4, shown = "hi", trailing = 2 → "┌─" + " hi " + "───┐"
    expect(out[0]).toBe("┌─\x1b[1;38;2;130;170;255m hi \x1b[0m───┐")
  })
})

describe("Box — row layout", () => {
  test("two text children sit at natural widths; slack pads to box inner", async () => {
    // CSS `flex: 0 1 auto` default — without `flexGrow`/`width: "fill"`,
    // text children stay at natural content width and the row's
    // leftover slack pads the end.
    const b = new Box({ flexDirection: "row" })
    b.add(new Text({ content: "aaaa" }))
    b.add(new Text({ content: "bbbb" }))
    expect(await b.render(ctx(10))).toEqual(["aaaabbbb  "])
  })

  test("flexGrow children share remaining slack equally", async () => {
    const b = new Box({ flexDirection: "row" })
    b.add(new Text({ content: "aaaa", flexGrow: 1 }))
    b.add(new Text({ content: "bbbb", flexGrow: 1 }))
    expect(await b.render(ctx(10))).toEqual(["aaaa bbbb "])
  })

  test("gap between row children; slack pads to box inner width", async () => {
    const b = new Box({ flexDirection: "row", gap: 2 })
    b.add(new Text({ content: "a", width: 3 }))
    b.add(new Text({ content: "b", width: 3 }))
    // outer=10, fixed+gap = 3+2+3 = 8, 2 trailing slack cells pad the row.
    expect(await b.render(ctx(10))).toEqual(["a    b    "])
  })

  test("different heights: shorter child padded with blanks", async () => {
    const b = new Box({ flexDirection: "row" })
    b.add(new Text({ content: "a\nb\nc", width: 2 }))
    b.add(new Text({ content: "x", width: 2 }))
    expect(await b.render(ctx(4))).toEqual(["a x ", "b   ", "c   "])
  })
})

describe("Box — style", () => {
  test("fg applied to each row", async () => {
    const b = new Box({ fg: "red" })
    b.add(new Text({ content: "x" }))
    expect(await b.render(ctx(3))).toEqual(["\x1b[31mx  \x1b[0m"])
  })

  test("bg reapplies after child's own reset", async () => {
    // Width-1 child inside a 3-wide box: after the child's reset the Box's
    // trailing slack padding must carry the bg, so the reset needs to be
    // followed by a bg-re-apply.
    const b = new Box({ bg: "#0000ff" })
    b.add(new Text({ content: "x", fg: "red", width: 1 }))
    const out = await b.render(ctx(3))
    expect(out).toHaveLength(1)
    expect(out[0]).toBe("\x1b[48;2;0;0;255m\x1b[31mx\x1b[0m\x1b[48;2;0;0;255m  \x1b[0m")
  })
})
