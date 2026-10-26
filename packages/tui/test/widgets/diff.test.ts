import type { RenderCtx } from "../../src/core/ctx.ts"

import { stringWidth } from "@zaly/shared/ansi"
import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { diff } from "../../src/widgets/diff.ts"

const ctx: RenderCtx = createCtx({ theme, width: 80 })

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "")
// Collapse to "gutter|prefix|trimmed content" for readable assertions.
const simplify = (rows: readonly string[]): string[] =>
  rows.map((r) => stripAnsi(r).replace(/ +$/, ""))

const files = [
  { name: "empty file", text: "", lines: [], terminated: false },
  { name: "unterminated line", text: "a", lines: ["a"], terminated: false },
  { name: "terminated line", text: "a\n", lines: ["a"], terminated: true },
  { name: "single empty line", text: "\n", lines: [""], terminated: true },
  { name: "trailing empty line", text: "a\n\n", lines: ["a", ""], terminated: true },
  {
    name: "internal empty lines",
    text: "a\n\nb\n\nc\n",
    lines: ["a", "", "b", "", "c"],
    terminated: true,
  },
  { name: "three terminated lines", text: "a\nb\nc\n", lines: ["a", "b", "c"], terminated: true },
  { name: "CRLF lines", text: "a\r\nb\r\n", lines: ["a", "b"], terminated: true },
]
const marker = String.raw`      \ No newline at end of file`

describe("Diff widget", () => {
  test.each(files)(
    "creation of $name preserves actual lines",
    async ({ text, lines, terminated }) => {
      const n = diff({ original: "", modified: text })
      const expected = lines.map((line, i) => `    ${i + 1}  + ${line}`.trimEnd())
      if (lines.length && !terminated) expected.push(marker)
      expect(simplify(await n.render(ctx))).toEqual(expected)
    }
  )

  test.each(files)(
    "deletion of $name preserves actual lines",
    async ({ text, lines, terminated }) => {
      const n = diff({ original: text, modified: "" })
      const expected = lines.map((line, i) => ` ${i + 1}     - ${line}`.trimEnd())
      if (lines.length && !terminated) expected.push(marker)
      expect(simplify(await n.render(ctx))).toEqual(expected)
    }
  )

  test("adding a final newline is a replacement, not an extra blank line", async () => {
    const n = diff({ original: "a", modified: "a\n" })
    expect(simplify(await n.render(ctx))).toEqual([" 1     - a", marker, "    1  + a"])
  })

  test("removing a final newline annotates only the added unterminated line", async () => {
    const n = diff({ original: "a\n", modified: "a" })
    expect(simplify(await n.render(ctx))).toEqual([" 1     - a", "    1  + a", marker])
  })

  test("replacing unterminated lines annotates both sides", async () => {
    const n = diff({ original: "a", modified: "b" })
    expect(simplify(await n.render(ctx))).toEqual([" 1     - a", marker, "    1  + b", marker])
  })

  test("an additional final newline adds one real empty line", async () => {
    const n = diff({ original: "a\n", modified: "a\n\n" })
    expect(simplify(await n.render(ctx))).toEqual([" 1  1    a", "    2  +"])
  })

  test("annotates an unterminated context line only once", async () => {
    const n = diff({ original: "a\nlast", modified: "b\nlast" })
    expect(simplify(await n.render(ctx))).toEqual([
      " 1     - a",
      "    1  + b",
      " 2  2    last",
      marker,
    ])
  })

  test("omits the EOF annotation when the final line is outside the hunk", async () => {
    const n = diff({ context: 0, original: "a\nb\nlast", modified: "A\nb\nlast" })
    expect(simplify(await n.render(ctx))).toEqual([" 1     - a", "    1  + A"])
  })

  test("wraps EOF annotations without overflowing the available width", async () => {
    const n = diff({ original: "", modified: "a" })
    const rows = await n.render(createCtx({ theme, width: 20 }))
    expect(rows.every((row) => stringWidth(row) <= 20)).toBe(true)
    expect(
      simplify(rows)
        .slice(1)
        .map((row) => row.trim())
        .join(" ")
    ).toBe(String.raw`\ No newline at end of file`)
  })

  test("gutter layout uses actual line counts at a digit boundary", async () => {
    const text = "a\n".repeat(9)
    const n = diff({ original: "", modified: text })
    expect(n.layout().width).toBe(11)
    expect(simplify(await n.render(ctx))).toHaveLength(9)
  })

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

  test("tab-indented Python renders like equivalent spaces without extending row backgrounds", async () => {
    const original = 'def normalize(value):\n\tif value:\n\t\treturn value\n\treturn ""\n'
    const modified =
      'def normalize(value):\n\tif value:\n\t\tvalue = value.strip()\n\t\treturn value.upper()\n\treturn ""\n'
    const tabbed = await diff({ original, modified }).render(ctx)
    const spaced = await diff({
      original: original.replaceAll("\t", "    "),
      modified: modified.replaceAll("\t", "    "),
    }).render(ctx)
    expect(tabbed).toEqual(spaced)
    expect(tabbed.every((row) => !row.includes("\t"))).toBe(true)
    expect(new Set(tabbed.map((row) => stringWidth(row))).size).toBe(1)
  })

  test("tab stops are relative to source content rather than the gutter", async () => {
    const rows = simplify(await diff({ original: "x\t=\t1\n", modified: "x\t=\t2\n" }).render(ctx))
    expect(rows).toEqual([" 1     - x   =   1", "    1  + x   =   2"])
  })

  test("tabs in ANSI-styled content expand before measuring and padding", async () => {
    const original = "\x1b[31m\told\x1b[0m\n"
    const modified = "\x1b[32m\tnew\x1b[0m\n"
    const tabbed = await diff({ original, modified }).render(ctx)
    const spaced = await diff({
      original: original.replaceAll("\t", "    "),
      modified: modified.replaceAll("\t", "    "),
    }).render(ctx)
    expect(tabbed).toEqual(spaced)
  })

  test("expanded tab indentation participates in wrapping", async () => {
    const rows = await diff({
      original: "\t\treturn old_value\n",
      modified: "\t\treturn new_value\n",
    }).render(createCtx({ theme, width: 24 }))
    expect(rows.every((row) => !row.includes("\t") && stringWidth(row) <= 24)).toBe(true)
    expect(rows.length).toBeGreaterThan(2)
  })

  test("tab-to-space-only edits remain visible", async () => {
    const rows = simplify(
      await diff({ original: "\tvalue = 1\n", modified: "    value = 1\n" }).render(ctx)
    )
    expect(rows).toEqual([" 1     -     value = 1", "    1  +     value = 1"])
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

  test("identical unterminated original/modified produces no rows or annotations", async () => {
    const n = diff({ context: 3, modified: "a\nb\nc", original: "a\nb\nc" })
    const rows = simplify(await n.render(ctx))
    expect(rows).toEqual([])
  })
})
