import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/index.ts"
import { code } from "../../src/widgets/code.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "")

describe("Code widget", () => {
  test("renders the code body with no title", async () => {
    const n = code({ code: "hello\nworld" })
    const rows = await n.render(ctx)
    const text = rows.map(stripAnsi).map((r) => r.replace(/ +$/, ""))
    expect(text).toEqual(["hello", "world"])
  })

  test("prepends the title as its own row", async () => {
    const n = code({ code: "x", title: "foo.ts" })
    const rows = await n.render(ctx)
    const text = rows.map(stripAnsi).map((r) => r.replace(/ +$/, ""))
    expect(text[0]).toBe("foo.ts")
    expect(text[1]).toBe("x")
  })

  test("syntax-highlights known languages (emits per-token ANSI)", async () => {
    const n = code({ code: "const x = 1", lang: "typescript" })
    const rows = await n.render(ctx)
    expect(rows[0]).toMatch(/\x1b\[/) // at least one SGR sequence
    expect(stripAnsi(rows[0]).startsWith("const x = 1")).toBe(true)
  })

  test("unknown language falls through to plain rendering", async () => {
    const n = code({ code: "x y z", lang: "not-a-real-lang-123" })
    const rows = await n.render(ctx)
    expect(stripAnsi(rows[0]).startsWith("x y z")).toBe(true)
  })
})
