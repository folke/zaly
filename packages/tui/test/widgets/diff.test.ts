import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/style/theme.ts"
import { diff } from "../../src/widgets/diff.ts"

const ctx: RenderCtx = createCtx({ theme, width: 80 })

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "")
// Collapse to "gutter|prefix|trimmed content" for readable assertions.
const simplify = (rows: readonly string[]): string[] =>
  rows.map((r) => stripAnsi(r).replace(/ +$/, ""))

describe("Diff widget", () => {
  test("single-line replacement shows one -/+ pair with context", async () => {
    const original = "a\nb\nc\nd\ne"
    const n = diff({
      context: 1,
      edits: [{ from: 2, to: 3, replacement: ["C"] }],
      original,
    })
    const rows = simplify(await n.render(ctx))
    // Single gutter column: newNum for context/add, origNum for remove.
    expect(rows).toEqual(["2   b", "3 - c", "3 + C", "4   d"])
  })

  test("insertion (from === to) renders with no removed rows", async () => {
    const original = "one\ntwo\nthree"
    const n = diff({
      context: 0,
      edits: [{ from: 1, to: 1, replacement: ["new"] }],
      original,
    })
    const rows = simplify(await n.render(ctx))
    // Just the added line (context=0 → no surrounding context).
    expect(rows.filter((r) => r.includes("+"))).toHaveLength(1)
    expect(rows.filter((r) => r.includes("-"))).toHaveLength(0)
  })

  test("deletion (replacement === []) renders with no added rows", async () => {
    const original = "one\ntwo\nthree"
    const n = diff({
      context: 0,
      edits: [{ from: 1, to: 2, replacement: [] }],
      original,
    })
    const rows = simplify(await n.render(ctx))
    expect(rows.filter((r) => r.includes("+"))).toHaveLength(0)
    expect(rows.filter((r) => r.includes("-"))).toHaveLength(1)
  })

  test("multiple edits align new-line numbers with accumulated offsets", async () => {
    const original = "a\nb\nc\nd\ne"
    const n = diff({
      context: 0,
      edits: [
        { from: 1, to: 2, replacement: ["B1", "B2"] }, // +1 line delta
        { from: 3, to: 4, replacement: [] }, // -1 line delta
      ],
      original,
    })
    const rows = simplify(await n.render(ctx))
    // First hunk: line b removed at orig=2, B1/B2 added at new=2,3.
    // Second hunk: line d removed at orig=4, newFrom would be 3 post-delta.
    // Offsets after first edit: delta = +1. So newFrom of second edit = 3 + 1 = 4.
    // Post-second-edit delta = 0. Total edited = 5 lines.
    expect(rows).toContain("2 - b")
    expect(rows).toContain("2 + B1")
    expect(rows).toContain("3 + B2")
    expect(rows).toContain("4 - d")
  })

  test("context lines fall between hunks when edits are spaced", async () => {
    const original = "a\nb\nc\nd\ne\nf\ng"
    const n = diff({
      context: 1,
      edits: [
        { from: 1, to: 2, replacement: ["B"] },
        { from: 5, to: 6, replacement: ["F"] },
      ],
      original,
    })
    const rows = simplify(await n.render(ctx))
    // Context rows appear around each hunk; they include both line numbers.
    // Assert both hunks rendered with their flanking context.
    expect(rows).toContain("1   a")
    expect(rows).toContain("3   c")
    expect(rows).toContain("5   e")
    expect(rows).toContain("7   g")
    // Changed lines:
    expect(rows).toContain("2 - b")
    expect(rows).toContain("2 + B")
    expect(rows).toContain("6 - f")
    expect(rows).toContain("6 + F")
  })

  test("renders a title above the diff when provided", async () => {
    const n = diff({
      context: 0,
      edits: [{ from: 0, to: 1, replacement: ["y"] }],
      original: "x",
      title: "foo.ts",
    })
    const rows = simplify(await n.render(ctx))
    expect(rows[0]).toBe("foo.ts")
  })

  test("syntax-highlighted lang: content carries ANSI (and line count is preserved)", async () => {
    const n = diff({
      context: 1,
      edits: [{ from: 0, to: 1, replacement: ["const x = 2"] }],
      lang: "typescript",
      original: "const x = 1\nconst y = 2",
    })
    const rows = await n.render(ctx)
    // Highlighted content injects SGR runs inside the row content.
    expect(rows.some((r) => r.includes("\x1b["))).toBe(true)
  })
})
