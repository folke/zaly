import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../src/core/ctx.ts"
import { Box, box, node, text } from "../src/index.ts"
import { Text } from "../src/nodes/text.ts"

const ctx = (width: number) => createCtx({ width })

describe("text()", () => {
  test("string content → Text", () => {
    const t = text("hello")
    expect(t).toBeInstanceOf(Text)
    expect(t.state.content).toBe("hello")
  })

  test("string + style", () => {
    const t = text("hi", { fg: "red", width: 5 })
    expect(t.state.content).toBe("hi")
    expect(t.state.fg).toBe("red")
    expect(t.state.width).toBe(5)
  })

  test("style object form", () => {
    const t = text({ content: "hi", fg: "red" })
    expect(t.state.content).toBe("hi")
    expect(t.state.fg).toBe("red")
  })
})

describe("box()", () => {
  test("empty box", () => {
    const b = box()
    expect(b).toBeInstanceOf(Box)
    expect(b.children).toEqual([])
  })

  test("style + children", () => {
    const t1 = text("a")
    const t2 = text("b")
    const b = box({ gap: 1 }, t1, t2)
    expect(b.state.gap).toBe(1)
    expect(b.children).toEqual([t1, t2])
  })

  test("children-only (no style)", () => {
    const t1 = text("a")
    const b = box(t1)
    expect(b.state).toEqual({})
    expect(b.children).toEqual([t1])
  })

  test("falsy children are filtered out", () => {
    const t = text("kept")
    // oxlint-disable-next-line no-null — exercising the documented filter.
    const b = box({}, t, false, null, undefined, text("also-kept"))
    expect(b.children).toHaveLength(2)
    expect(b.children[0]).toBe(t)
  })
})

describe("node()", () => {
  test("single-Node render is composed", async () => {
    const n = node({ label: "hello" }, ({ state }) => text(state.label, { width: 5 }))
    expect(await n.render(ctx(10))).toEqual(["hello"])
  })

  test("state mutation re-renders via parent linkage", async () => {
    const n = node({ label: "a" }, ({ state }) => text(state.label, { width: 3 }))
    let rows = await n.render(ctx(10))
    expect(rows[0]).toBe("a  ")
    n.state.label = "bc"
    rows = await n.render(ctx(10))
    expect(rows[0]).toBe("bc ")
  })

  test("array render stacks children", async () => {
    const n = node({}, () => [text("a", { width: 3 }), text("b", { width: 3 })])
    expect(await n.render(ctx(10))).toEqual(["a  ", "b  "])
  })

  test("array render filters falsy entries", async () => {
    const n = node({ show: false }, ({ state }) => [
      text("a", { width: 3 }),
      state.show && text("b", { width: 3 }),
    ])
    expect(await n.render(ctx(10))).toEqual(["a  "])
  })

  test("emit is wired to custom node", async () => {
    type E = { changed: [value: number] }
    const listener = vi.fn()
    const n = node<{ v: number }, E & { invalidate: []; mount: []; unmount: [] }>(
      { v: 0 },
      ({ state, emit }) => {
        emit("changed", state.v)
        return text(`v=${state.v}`, { width: 5 })
      }
    )
    n.on("changed", listener)
    await n.render(ctx(10))
    expect(listener).toHaveBeenCalledWith(0)
  })
})
