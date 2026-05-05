import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Text } from "../../src/widgets/text.ts"

const ctx = (width: number) => createCtx({ width })

describe("Text", () => {
  test("fits in one row at natural width (no fill)", async () => {
    // Default — no `width` prop — emits content at its natural width;
    // padding to fill the parent's slot is the parent box's job.
    const t = new Text({ content: "hello" })
    expect(await t.render(ctx(10))).toEqual(["hello"])
  })

  test("explicit `width: 'fill'` pads to ctx.width", async () => {
    const t = new Text({ content: "hello", width: "fill" })
    expect(await t.render(ctx(10))).toEqual(["hello     "])
  })

  test("word wraps by default at ctx.width but emits natural rows", async () => {
    // `wrapBudget` defaults to ctx.width so wrapping breaks at sensible
    // column counts. Rows are emitted at their natural widths — the
    // parent box decides whether to pad them. wrapAnsi may keep a
    // trailing space when the next word would tip over the budget;
    // we propagate that through unchanged.
    const t = new Text({ content: "hello world and one more" })
    expect(await t.render(ctx(10))).toEqual(["hello ", "world and ", "one more"])
  })

  test("explicit width narrower than ctx wraps at that width", async () => {
    // "hello world" at width 5 is a pathological case: the inter-word space
    // can't fit on either line (5+1 > 5, and 1+5 > 5). wrap-ansi with
    // trim:false places it on its own line so structural whitespace is
    // never silently dropped. Realistic widths (20+) don't hit this.
    const t = new Text({ content: "hello world", width: 5 })
    expect(await t.render(ctx(20))).toEqual(["hello", "     ", "world"])
  })

  test("percent width", async () => {
    const t = new Text({ content: "hello world", width: "50%" })
    expect(await t.render(ctx(20))).toEqual(["hello     ", "world     "])
  })

  test("char wrap hard-breaks long words", async () => {
    const t = new Text({ content: "supercalifragilistic", width: 5, wrap: "char" })
    expect(await t.render(ctx(20))).toEqual(["super", "calif", "ragil", "istic"])
  })

  test("multi-line content preserves explicit newlines", async () => {
    const t = new Text({ content: "line one\nline two" })
    expect(await t.render(ctx(10))).toEqual(["line one", "line two"])
  })

  test("wrap: 'none' splits on newlines only", async () => {
    const t = new Text({ content: "one\ntwo", width: 10, wrap: "none" })
    expect(await t.render(ctx(20))).toEqual(["one       ", "two       "])
  })

  test("fg applied to each row", async () => {
    const t = new Text({ content: "hi", fg: "red", width: 5 })
    expect(await t.render(ctx(10))).toEqual(["\x1b[31mhi   \x1b[0m"])
  })

  test("bold + fg combined", async () => {
    const t = new Text({ bold: true, content: "x", fg: "red", width: 3 })
    expect(await t.render(ctx(10))).toEqual(["\x1b[1;31mx  \x1b[0m"])
  })

  test("no style: no escapes emitted", async () => {
    const t = new Text({ content: "plain", width: 8 })
    expect(await t.render(ctx(10))).toEqual(["plain   "])
  })

  test("state mutation invalidates cache", async () => {
    const t = new Text({ content: "hi", width: 5 })
    await t.render(ctx(10))
    t.state.content = "bye"
    expect(await t.render(ctx(10))).toEqual(["bye  "])
  })

  test("content as a function receives ctx", async () => {
    const t = new Text({
      content: (c) => `w=${c.width}`,
      width: 6,
      wrap: "none",
    })
    expect(await t.render(ctx(10))).toEqual(["w=10  "])
  })

  test("content function can compose styled spans via ctx.style", async () => {
    const t = new Text({
      content: ({ style }) => `${style.success("+12")} ${style.error("-4")}`,
      wrap: "none",
    })
    const [row] = await t.render(ctx(20))
    // The theme-slot escapes come from the default theme bound on the ctx;
    // asserting the visible portion keeps the test theme-agnostic.
    expect(row).toContain("+12")
    expect(row).toContain("-4")
    expect(row).toContain("\x1b[") // at least some escape was emitted
  })
})
