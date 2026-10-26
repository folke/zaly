import type { Color } from "../../src/index.ts"

import { stringWidth, stripAnsi } from "@zaly/shared/ansi"
import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Box } from "../../src/widgets/box.ts"
import { Text } from "../../src/widgets/text.ts"

const ctx = (width: number) => createCtx({ width })

describe("Text", () => {
  test("emits content at natural width (parent pads to slot)", async () => {
    // Text doesn't size itself — it wraps at `ctx.width` and emits
    // natural-width rows. Padding to fill the parent's slot is the
    // box layout's job.
    const t = new Text({ content: "hello" })
    expect(await t.render(ctx(10))).toEqual(["hello"])
  })

  test("word wraps at ctx.width by default; rows stay natural", async () => {
    // `wrapBudget` is ctx.width so wrapping breaks at sensible column
    // counts. wrap-ansi may keep a trailing space when the next word
    // would tip over the budget; we propagate that through unchanged.
    const t = new Text({ content: "hello world and one more" })
    expect(await t.render(ctx(10))).toEqual(["hello ", "world and ", "one more"])
  })

  test.each(["word", "char"] as const)(
    "%s wrapping preserves CJK text beyond a cell boundary",
    async (wrap) => {
      const content = "你好世界你好世界"
      const rows = await new Text({ content, wrap }).render(ctx(10))
      expect(rows).toEqual(["你好世界你", "好世界"])
      expect(rows.join("")).toBe(content)
      expect(rows.every((row) => stringWidth(row) <= 10)).toBe(true)
    }
  )

  test.each(["你好世界你好世界   ", "中文🙂中文🙂中文", "e\u0301你好世界你好世界"])(
    "styled wide text is not mistaken for trailing whitespace: %s",
    async (content) => {
      const rows = await new Text({ content: `\x1b[31m${content}\x1b[0m` }).render(ctx(10))
      expect(
        rows
          .map((row) => stripAnsi(row))
          .join("")
          .trimEnd()
          .normalize()
      ).toBe(content.trimEnd().normalize())
      expect(rows.length).toBeGreaterThan(1)
      expect(rows.every((row) => stringWidth(row) <= 10)).toBe(true)
    }
  )

  test("trims genuine overflowing padding when the visible CJK text fits", async () => {
    const rows = await new Text({ content: "你好世界     " }).render(ctx(10))
    expect(rows).toEqual(["你好世界  "])
  })

  test("narrow ctx wraps content tightly", async () => {
    // A break-space belongs to the wrap boundary, not to its own visual row.
    // "hello world" at width 5 should render as two words, not a standalone
    // row containing only the inter-word separator.
    const t = new Text({ content: "hello world" })
    expect(await t.render(ctx(5))).toEqual(["hello", "world"])
    expect(await t.render(ctx(6))).toEqual(["hello ", "world"])
  })

  test("char wrap hard-breaks long words", async () => {
    const t = new Text({ content: "supercalifragilistic", wrap: "char" })
    expect(await t.render(ctx(5))).toEqual(["super", "calif", "ragil", "istic"])
  })

  test("multi-line content preserves explicit newlines", async () => {
    const t = new Text({ content: "line one\nline two" })
    expect(await t.render(ctx(10))).toEqual(["line one", "line two"])
  })

  test("wrap: 'none' splits on newlines only, no padding", async () => {
    const t = new Text({ content: "one\ntwo", wrap: "none" })
    expect(await t.render(ctx(20))).toEqual(["one", "two"])
  })

  test("fg applied to each row at natural width", async () => {
    const t = new Text({ content: "hi", fg: "red" as Color<false> })
    expect(await t.render(ctx(10))).toEqual(["\x1b[31mhi\x1b[0m"])
  })

  test("bold + fg combined at natural width", async () => {
    const t = new Text({ bold: true, content: "x", fg: "red" as Color<false> })
    expect(await t.render(ctx(10))).toEqual(["\x1b[1;31mx\x1b[0m"])
  })

  test("no style: no escapes emitted", async () => {
    const t = new Text({ content: "plain" })
    expect(await t.render(ctx(10))).toEqual(["plain"])
  })

  test("state mutation invalidates cache", async () => {
    const t = new Text({ content: "hi" })
    await t.render(ctx(10))
    t.state.content = "bye"
    expect(await t.render(ctx(10))).toEqual(["bye"])
  })

  test("content as a function receives ctx", async () => {
    const t = new Text({ content: (c) => `w=${c.width}`, wrap: "none" })
    expect(await t.render(ctx(10))).toEqual(["w=10"])
  })

  test("content function can compose styled spans via ctx.style", async () => {
    const t = new Text({
      content: ({ style }) => `${style.success("+12")} ${style.error("-4")}`,
      wrap: "none",
    })
    const [row] = await t.render(ctx(20))
    expect(row).toContain("+12")
    expect(row).toContain("-4")
    expect(row).toContain("\x1b[") // at least some escape was emitted
  })

  test("width on Text drives the box's allocated slot, not Text itself", async () => {
    // `width` on Text state is a layout hint (via Flexible / BaseState).
    // Text doesn't read it — the parent box does. So `text({ width: 5 })`
    // inside a column box gets a 5-cell cross-axis slot; the rendered
    // row is padded to 5 by the box.
    const b = new Box({})
    b.add(new Text({ content: "hi", width: 5 }))
    expect(await b.render(ctx(10))).toEqual(["hi        "])
  })
})
