// oxlint-disable unicorn/no-await-expression-member
import type { RenderCtx } from "../../src/core/ctx.ts"
import type { MenuItem } from "../../src/widgets/menu.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
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
    expect(fn).toHaveBeenCalledWith({ item: items[1], type: "select" }, m, expect.anything())
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

  test("maxHeight caps visible item rows; window follows active", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      value: `cmd${i}`,
    }))
    const m = menu({ counter: false, items: manyItems, maxHeight: 3 })
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

  test("counter auto-shows as the last row when items exceed maxHeight", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({ value: `cmd${i}` }))
    const m = menu({ items: manyItems, maxHeight: 3 })
    m.state.active = 4
    const rows = (await m.render(ctx)).map(stripAnsi)
    // 3 item rows + 1 counter row.
    expect(rows).toHaveLength(4)
    expect(rows[3]).toMatch(/5\s*\/\s*10/)
  })

  test("counter hides when counter: false", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({ value: `cmd${i}` }))
    const m = menu({ counter: false, items: manyItems, maxHeight: 3 })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => !/\d+\/\d+/.test(r))).toBe(true)
  })

  test("counter does not show when everything fits", async () => {
    const m = menu({ items })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(items.length)
  })

  test("pin-until-leave: window doesn't move while active stays in view", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({ value: `cmd${i}` }))
    const m = menu({ counter: false, items: manyItems, maxHeight: 4 })
    // First render starts at 0–3. Move active forward within the window.
    m.state.active = 2
    let rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows[0]).toContain("cmd0")
    expect(rows[3]).toContain("cmd3")
    // Still inside window.
    m.state.active = 3
    rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows[0]).toContain("cmd0")
    expect(rows[3]).toContain("cmd3")
    // One past the window — slide by one.
    m.state.active = 4
    rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows[0]).toContain("cmd1")
    expect(rows[3]).toContain("cmd4")
  })

  test("sticky: counter row persists once shown, so total height stays put", async () => {
    const many = Array.from({ length: 27 }, (_, i) => ({ value: `cmd${i}` }))
    const m = menu({ items: many, maxHeight: 8, sticky: true })
    // Initial: 8 item rows + 1 counter = 9 rows.
    let rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(9)
    expect(rows[8]).toMatch(/\d+\/27/)
    // Filter down to something that fits — without the persistent
    // counter we'd drop from 9 rows to 8.
    m.state.items = [{ value: "cmd0" }, { value: "cmd1" }, { value: "cmd2" }]
    rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(9)
    // Last row still carries a counter, now reflecting the filtered total.
    expect(rows[8]).toMatch(/\d+\/3/)
  })

  test("sticky: height grows but doesn't shrink; resetHeight clears it", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ value: `cmd${i}` }))
    const m = menu({ counter: false, items: many, maxHeight: 5, sticky: true })
    let rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(5)
    // Shrink items — rendered height should stay at 5 with blank filler.
    m.state.items = [{ value: "cmd0" }]
    rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(5)
    expect(rows[0]).toContain("cmd0")
    expect(rows[1].trim()).toBe("")
    // Reset allows shrink again.
    m.resetHeight()
    rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain("cmd0")
  })

  test("generic over item type — select payload is typed as T", () => {
    interface Cmd {
      value: string
      fn: () => void
    }
    const fn = vi.fn()
    const m = menu<Cmd>({ items: [{ fn, value: "/quit" }] })
    m.on("select", ({ item: it }) => it.fn())
    m.actions["menu.select"]()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("custom render is used for item rows; menuActive still paints selection", async () => {
    interface Row extends MenuItem {
      tag: string
    }
    const m = menu<Row>({
      items: [{ tag: "alpha" }, { tag: "beta" }, { tag: "gamma" }],
      render: (it, active) => `${active ? "→" : " "} ${it.tag}`,
    })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows[0]).toMatch(/^→ alpha/)
    expect(rows[1]).toMatch(/^\s+beta/)
    expect(rows[2]).toMatch(/^\s+gamma/)
  })

  test("default render throws when items carry neither label nor value", async () => {
    const m = menu({ items: [{} as unknown as { value: string }] })
    await expect(m.render(ctx)).rejects.toThrow(/label.*value.*render/)
  })

  test("select on empty menu does not emit", () => {
    const m = menu({ items: [] })
    const fn = vi.fn()
    m.on("select", fn)
    m.actions["menu.select"]()
    expect(fn).not.toHaveBeenCalled()
  })
})
