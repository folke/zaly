import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/index.ts"
import { code } from "../../src/widgets/code.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "")

describe("Code widget", () => {
  // Strip the box's `padding: [0, 1]` chrome around the body so
  // assertions focus on content. ANSI is also stripped so we don't
  // depend on the specific theme escapes.
  const trim = (rows: string[]) =>
    rows.map((r) => stripAnsi(r).replace(/^ +| +$/g, ""))

  test("renders the code body with no title", async () => {
    const n = code({ code: "hello\nworld" })
    expect(trim(await n.render(ctx))).toEqual(["hello", "world"])
  })

  test("prepends the title as its own row", async () => {
    const n = code({ code: "x", title: "foo.ts" })
    const text = trim(await n.render(ctx))
    expect(text[0]).toBe("foo.ts")
    expect(text[1]).toBe("x")
  })

  test("syntax-highlights known languages (emits per-token ANSI)", async () => {
    const n = code({ code: "const x = 1", lang: "typescript" })
    const rows = await n.render(ctx)
    expect(rows[0]).toMatch(/\x1b\[/) // at least one SGR sequence
    expect(trim(rows)[0]).toBe("const x = 1")
  })

  test("unknown language falls through to plain rendering", async () => {
    const n = code({ code: "x y z", lang: "not-a-real-lang-123" })
    const rows = await n.render(ctx)
    expect(trim(rows)[0]).toBe("x y z")
  })
})
