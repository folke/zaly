import type { RenderCtx } from "../../src/core/ctx.ts"
import type { TreeItem } from "../../src/widgets/tree.ts"

import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { unwrap } from "../../src/core/reactive.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { tree } from "../../src/widgets/tree.ts"

const ctx: RenderCtx = createCtx({ theme, width: 60 })

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

const sample = (): TreeItem => ({
  text: "root",
  children: [
    { text: "src", children: [{ text: "index.ts" }, { text: "util.ts" }] },
    { text: "README.md" },
  ],
})

describe("tree", () => {
  test("flattens descendants and hides the root by default", async () => {
    const t = tree({ tree: sample() })

    expect(unwrap(t.items).map((i) => i.text)).toEqual(["src", "index.ts", "util.ts", "README.md"])

    const rendered = await t.render(ctx)
    const rows = rendered.map(stripAnsi)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toContain("src")
    expect(rows[1]).toContain("├─index.ts")
    expect(rows[2]).toContain("╰─util.ts")
    expect(rows.at(-1)).toContain("README.md")
  })

  test("includes the root when root is true", async () => {
    const t = tree({ root: true, tree: sample() })

    expect(unwrap(t.items).map((i) => i.text)).toEqual([
      "root",
      "src",
      "index.ts",
      "util.ts",
      "README.md",
    ])

    const rendered = await t.render(ctx)
    const rows = rendered.map(stripAnsi)
    expect(rows[0]).toContain("root")
    expect(rows[1]).toContain("├─src")
    expect(rows[2]).toContain("│ ├─index.ts")
  })

  test("uses active item or predicate to seed select active index", () => {
    const root = sample()
    const readme = root.children?.[1]
    expect(tree({ active: readme, tree: root }).state.active).toBe(3)
    expect(tree({ active: (item) => item.text === "util.ts", tree: root }).state.active).toBe(2)
    expect(tree({ active: (item) => item.text === "missing", tree: root }).state.active).toBe(0)
  })

  test("passes indentation width to custom renderers", async () => {
    const t = tree({
      tree: sample(),
      render: (item, renderCtx) => `${renderCtx.prefixWidth}:${item.text}`,
    })

    const rendered = await t.render(ctx)
    const rows = rendered.map(stripAnsi)
    expect(rows[0]).toContain("0:src")
    expect(rows[1]).toContain("2:index.ts")
  })
})
