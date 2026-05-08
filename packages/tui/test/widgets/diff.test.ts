import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/index.ts"
import { diff } from "../../src/widgets/diff.ts"

const ctx: RenderCtx = createCtx({ theme, width: 80 })

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "")
// Collapse to "gutter|prefix|trimmed content" for readable assertions.
const simplify = (rows: readonly string[]): string[] =>
  rows.map((r) => stripAnsi(r).replace(/ +$/, ""))

describe("Diff widget", () => {
  test("single-line replacement shows one -/+ pair with context", async () => {
    const n = diff({
      context: 1,
      modified: "a\nb\nC\nd\ne",
      original: "a\nb\nc\nd\ne",
    })
    const rows = simplify(await n.render(ctx))
    // Gutter: ` <orig>  <new> ` (6 cells at numWidth=1). Prefix:
    // `   ` for context, ` - ` for remove, ` + ` for add. Trailing
    // spaces collapsed by simplify.
    expect(rows).toEqual([" 2  2    b", " 3     - c", "    3  + C", " 4  4    d"])
  })

  test("insertion renders with no removed rows", async () => {
    const n = diff({
      context: 0,
      modified: "one\nnew\ntwo\nthree",
      original: "one\ntwo\nthree",
    })
    const rows = simplify(await n.render(ctx))
    expect(rows.filter((r) => r.includes("+"))).toHaveLength(1)
    expect(rows.filter((r) => r.includes("-"))).toHaveLength(0)
  })

  test("deletion renders with no added rows", async () => {
    const n = diff({
      context: 0,
      modified: "one\nthree",
      original: "one\ntwo\nthree",
    })
    const rows = simplify(await n.render(ctx))
    expect(rows.filter((r) => r.includes("+"))).toHaveLength(0)
    expect(rows.filter((r) => r.includes("-"))).toHaveLength(1)
  })

  test("multiple edits align new-line numbers with accumulated offsets", async () => {
    // Hunk 1: replace line `b` (orig 2) with `B1` + `B2` → +1 delta.
    // Hunk 2: drop line `d` (orig 4) → −1 delta. Post-edit total = 5 lines.
    const n = diff({
      context: 0,
      modified: "a\nB1\nB2\nc\ne",
      original: "a\nb\nc\nd\ne",
    })
    const rows = simplify(await n.render(ctx))
    expect(rows).toContain(" 2     - b")
    expect(rows).toContain("    2  + B1")
    expect(rows).toContain("    3  + B2")
    expect(rows).toContain(" 4     - d")
  })

  test("context lines fall between hunks when edits are spaced", async () => {
    const n = diff({
      context: 1,
      modified: "a\nB\nc\nd\ne\nF\ng",
      original: "a\nb\nc\nd\ne\nf\ng",
    })
    const rows = simplify(await n.render(ctx))
    expect(rows).toContain(" 1  1    a")
    expect(rows).toContain(" 3  3    c")
    expect(rows).toContain(" 5  5    e")
    expect(rows).toContain(" 7  7    g")
    expect(rows).toContain(" 2     - b")
    expect(rows).toContain("    2  + B")
    expect(rows).toContain(" 6     - f")
    expect(rows).toContain("    6  + F")
  })

  test("syntax-highlighted lang: content carries ANSI", async () => {
    const n = diff({
      context: 1,
      lang: "typescript",
      modified: "const x = 2\nconst y = 2",
      original: "const x = 1\nconst y = 2",
    })
    const rows = await n.render(ctx)
    expect(rows.some((r) => r.includes("\x1b["))).toBe(true)
  })

  test("identical original/modified produces no diff rows (still emits title)", async () => {
    const n = diff({ context: 3, modified: "a\nb\nc", original: "a\nb\nc" })
    const rows = simplify(await n.render(ctx))
    // Title row is the only output; no add/remove/context rows since
    // there's no diff.
    expect(rows.filter((r) => r.includes("-") || r.includes("+"))).toHaveLength(0)
  })
})
