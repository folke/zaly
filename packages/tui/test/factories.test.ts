import { describe, expect, test } from "vitest"
import { createCtx } from "../src/core/ctx.ts"
import { Box, box, text, widget } from "../src/index.ts"
import { Text } from "../src/widgets/text.ts"

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
    const b = box({})
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

  test("style-less box (use `{}`)", () => {
    const t1 = text("a")
    const b = box({}, t1)
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

describe("widget()", () => {
  test("calling the widget produces a WidgetNode wrapping the inner Node", async () => {
    const greeting = widget((props: { name: string }) => text(`hi ${props.name}`))
    const node = greeting({ name: "ada" })
    await node._render(ctx(10)) // forces the inner node to be created so we can inspect it
    expect(node.child).toBeInstanceOf(Text)
    expect(node.state).toEqual({ name: "ada" })
    expect(await node.render(ctx(10))).toEqual(["hi ada"])
  })

  test("body runs exactly once at construction", async () => {
    let calls = 0
    const counter = widget((props: { id: number }) => {
      calls++
      return text(`#${props.id}`)
    })
    const c = counter({ id: 1 })
    counter({ id: 2 })
    counter({ id: 3 })
    // component is lazily creaated on first render
    expect(calls).toBe(0)
    await c._render(ctx(10))
    expect(calls).toBe(1)
    await c._render(ctx(10))
    expect(calls).toBe(1)
  })

  test("composes inside a parent like any other Node factory", async () => {
    const tag = widget((props: { text: string }) => text(`[${props.text}]`, { width: 5 }))
    const root = box({}, tag({ text: "a" }), tag({ text: "b" }))
    expect(await root.render(ctx(10))).toEqual(["[a]       ", "[b]       "])
  })

  test("props are captured in leaf thunks for ctx-driven styling", async () => {
    const status = widget((props: { msg: string }) =>
      text(({ style }) => style.dim(props.msg), { width: 8 })
    )
    const node = status({ msg: "ready" })
    const rows = await node.render(ctx(10))
    expect(rows[0]).toContain("ready")
  })
})
