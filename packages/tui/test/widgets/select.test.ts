// oxlint-disable unicorn/no-await-expression-member
import type { RenderCtx } from "../../src/core/ctx.ts"
import type { Option } from "../../src/widgets/select.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { select } from "../../src/widgets/select.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })

const items = [
  { desc: "show commands", value: "/help" },
  { desc: "exit", value: "/quit" },
  { desc: "pick a model", value: "/model" },
]

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

describe("menu", () => {
  test("renders one row per item with active marker on first by default", async () => {
    const m = select({ items })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain("/help")
    expect(rows[0]).toContain("show commands")
    expect(rows[1]).toContain("/quit")
  })

  test("label defaults to value; custom label wins", async () => {
    const m = select({
      items: [{ name: "Custom", value: "x" }],
    })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows[0]).toContain("Custom")
  })

  test("next/prev/first/last move the active index", () => {
    const m = select({ items })
    expect(m.state.active).toBe(0)
    m.actions["select.next"]()
    expect(m.state.active).toBe(1)
    m.actions["select.next"]()
    m.actions["select.next"]()
    // wraps: going past end returns to 0
    expect(m.state.active).toBe(0)
    m.actions["select.prev"]()
    expect(m.state.active).toBe(2)
    m.actions["select.first"]()
    expect(m.state.active).toBe(0)
    m.actions["select.last"]()
    expect(m.state.active).toBe(2)
  })

  test("select emits select with active item", () => {
    const m = select({ items })
    const fn = vi.fn()
    m.on("accept", fn)
    m.actions["select.next"]()
    m.actions["select.accept"]()
    expect(fn).toHaveBeenCalledWith({ item: items[1], type: "accept" }, m, expect.anything())
  })

  test("cancel emits cancel", () => {
    const m = select({ items })
    const fn = vi.fn()
    m.on("cancel", fn)
    m.actions["select.cancel"]()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("empty items renders nothing", async () => {
    const m = select({ items: [] })
    const rows = await m.render(ctx)
    expect(rows).toEqual([])
  })

  test("maxHeight caps visible item rows; window follows active", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      name: `cmd${i}`,
      value: `cmd${i}`,
    }))
    const m = select({ counter: false, items: manyItems, maxHeight: 3 })
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
    const manyItems = Array.from({ length: 10 }, (_, i) => ({ name: `cmd${i}`, value: `cmd${i}` }))
    const m = select({ items: manyItems, maxHeight: 3 })
    m.state.active = 4
    const rows = (await m.render(ctx)).map(stripAnsi)
    // 3 item rows + 1 counter row.
    expect(rows).toHaveLength(4)
    expect(rows[3]).toMatch(/5\s*\/\s*10/)
  })

  test("counter hides when counter: false", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      name: `cmd${i}`,
      value: `cmd${i}`,
    }))
    const m = select({ counter: false, items: manyItems, maxHeight: 3 })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => !/\d+\/\d+/.test(r))).toBe(true)
  })

  test("counter does not show when everything fits", async () => {
    const m = select({ items })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(items.length)
  })

  test("pin-until-leave: window doesn't move while active stays in view", async () => {
    const manyItems = Array.from({ length: 10 }, (_, i) => ({
      name: `cmd${i}`,
      value: `cmd${i}`,
    }))
    const m = select({ counter: false, items: manyItems, maxHeight: 4 })
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
    const many = Array.from({ length: 27 }, (_, i) => ({
      name: `cmd${i}`,
      value: `cmd${i}`,
    }))
    const m = select({ items: many, maxHeight: 8, sticky: true })
    // Initial: 8 item rows + 1 counter = 9 rows.
    let rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(9)
    expect(rows[8]).toMatch(/\d+\/27/)
    // Filter down to something that fits — without the persistent
    // counter we'd drop from 9 rows to 8.
    m.state.items = [
      {
        name: "cmd0",
        value: "cmd0",
      },
      { name: "cmd1", value: "cmd1" },
      { name: "cmd2", value: "cmd2" },
    ]
    rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(9)
    // Last row still carries a counter, now reflecting the filtered total.
    expect(rows[8]).toMatch(/\d+\/3/)
  })

  test("sticky: height grows but doesn't shrink; resetHeight clears it", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      name: `cmd${i}`,
      value: `cmd${i}`,
    }))
    const m = select({ counter: false, items: many, maxHeight: 5, sticky: true })
    let rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows).toHaveLength(5)
    // Shrink items — rendered height should stay at 5 with blank filler.
    m.state.items = [
      {
        name: "cmd0",
        value: "cmd0",
      },
    ]
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
      name: string
      value: string
      fn: () => void
    }
    const fn = vi.fn()
    const m = select<Cmd>({ items: [{ fn, value: "/quit", name: "quit" }] })
    m.on("accept", ({ item: it }) => it.fn())
    m.actions["select.accept"]()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("custom render is used for item rows; menuActive still paints selection", async () => {
    interface Row extends Option {
      tag: string
    }
    const m = select<Row>({
      items: [
        { name: "alpha", tag: "alpha", value: "alpha" },
        { name: "beta", tag: "beta", value: "beta" },
        { name: "gamma", tag: "gamma", value: "gamma" },
      ],
      render: (it, active) => `${active ? "→" : " "} ${it.tag}`,
    })
    const rows = (await m.render(ctx)).map(stripAnsi)
    expect(rows[0]).toMatch(/^→ alpha/)
    expect(rows[1]).toMatch(/^\s+beta/)
    expect(rows[2]).toMatch(/^\s+gamma/)
  })

  test("select on empty menu does not emit", () => {
    const m = select({ items: [] })
    const fn = vi.fn()
    m.on("accept", fn)
    m.actions["select.accept"]()
    expect(fn).not.toHaveBeenCalled()
  })
})
