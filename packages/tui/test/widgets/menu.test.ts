// oxlint-disable unicorn/no-await-expression-member
import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { moon as theme } from "../../src/style/theme.ts"
import { menu } from "../../src/widgets/menu.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })

const items = [
  { hint: "show commands", value: "/help" },
  { hint: "exit", value: "/quit" },
  { hint: "pick a model", value: "/model" },
]

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

describe("menu", () => {
  test("renders one row per item with active marker on first by default", async () => {
    const m = menu({ items })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain("/help")
    expect(rows[0]).toContain("show commands")
    expect(rows[1]).toContain("/quit")
  })

  test("label defaults to value; custom label wins", async () => {
    const m = menu({
      items: [{ label: "Custom", value: "x" }],
    })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows[0]).toContain("Custom")
  })

  test("next/prev/first/last move the active index", () => {
    const m = menu({ items })
    expect(m.state.active).toBe(0)
    m.actions["menu.next"]()
    expect(m.state.active).toBe(1)
    m.actions["menu.next"]()
    m.actions["menu.next"]()
    // wraps: going past end returns to 0
    expect(m.state.active).toBe(0)
    m.actions["menu.prev"]()
    expect(m.state.active).toBe(2)
    m.actions["menu.first"]()
    expect(m.state.active).toBe(0)
    m.actions["menu.last"]()
    expect(m.state.active).toBe(2)
  })

  test("select emits select with active item", () => {
    const m = menu({ items })
    const fn = vi.fn()
    m.on("select", fn)
    m.actions["menu.next"]()
    m.actions["menu.select"]()
    expect(fn).toHaveBeenCalledWith(items[1], m)
  })

  test("cancel emits cancel", () => {
    const m = menu({ items })
    const fn = vi.fn()
    m.on("cancel", fn)
    m.actions["menu.cancel"]()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("empty items renders nothing", async () => {
    const m = menu({ items: [] })
    const rows = await m.render(ctx)
    expect(rows).toEqual([])
  })

  test("maxHeight caps visible rows; window follows active", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      value: `cmd${i}`,
    }))
    const m = menu({ items: manyItems, maxHeight: 3 })
    let rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain("cmd0")
    expect(rows[2]).toContain("cmd2")
    // Move active to index 5 — window should slide.
    m.state.active = 5
    rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(3)
    expect(rows.some((r) => r.includes("cmd5"))).toBe(true)
  })

  test("select on empty menu does not emit", () => {
    const m = menu({ items: [] })
    const fn = vi.fn()
    m.on("select", fn)
    m.actions["menu.select"]()
    expect(fn).not.toHaveBeenCalled()
  })
})
