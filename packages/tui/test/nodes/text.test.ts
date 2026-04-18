import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test } from "vitest"
import { Text } from "../../src/nodes/text.ts"
import { tokyoNightMoon } from "../../src/themes/tokyonight-moon.ts"

const ctx = (width: number): RenderCtx => ({ theme: tokyoNightMoon, width })

describe("Text", () => {
  test("fits in one row padded to allocated width (default fill)", () => {
    const t = new Text({ content: "hello" })
    expect(t.render(ctx(10))).toEqual(["hello     "])
  })

  test("word wraps by default", () => {
    const t = new Text({ content: "hello world and one more" })
    expect(t.render(ctx(10))).toEqual(["hello     ", "world and ", "one more  "])
  })

  test("explicit width narrower than ctx wraps at that width", () => {
    const t = new Text({ content: "hello world", width: 5 })
    expect(t.render(ctx(20))).toEqual(["hello", "world"])
  })

  test("percent width", () => {
    const t = new Text({ content: "hello world", width: "50%" })
    expect(t.render(ctx(20))).toEqual(["hello     ", "world     "])
  })

  test("char wrap hard-breaks long words", () => {
    const t = new Text({ content: "supercalifragilistic", width: 5, wrap: "char" })
    expect(t.render(ctx(20))).toEqual(["super", "calif", "ragil", "istic"])
  })

  test("auto width = longest word in word mode", () => {
    const t = new Text({ content: "hi there friend", width: "auto" })
    // longest word = "friend" (6 cells); rows pad to 6
    expect(t.render(ctx(100))).toEqual(["hi    ", "there ", "friend"])
  })

  test("multi-line content preserves explicit newlines", () => {
    const t = new Text({ content: "line one\nline two" })
    expect(t.render(ctx(10))).toEqual(["line one  ", "line two  "])
  })

  test("wrap: 'none' splits on newlines only", () => {
    const t = new Text({ content: "one\ntwo", width: 10, wrap: "none" })
    expect(t.render(ctx(20))).toEqual(["one       ", "two       "])
  })

  test("fg applied to each row", () => {
    const t = new Text({ content: "hi", fg: "red", width: 5 })
    expect(t.render(ctx(10))).toEqual(["\x1b[31mhi   \x1b[0m"])
  })

  test("bold + fg combined", () => {
    const t = new Text({ bold: true, content: "x", fg: "red", width: 3 })
    expect(t.render(ctx(10))).toEqual(["\x1b[1;31mx  \x1b[0m"])
  })

  test("no style: no escapes emitted", () => {
    const t = new Text({ content: "plain", width: 8 })
    expect(t.render(ctx(10))).toEqual(["plain   "])
  })

  test("state mutation invalidates cache", () => {
    const t = new Text({ content: "hi", width: 5 })
    t.render(ctx(10))
    t.state.content = "bye"
    expect(t.render(ctx(10))).toEqual(["bye  "])
  })
})
