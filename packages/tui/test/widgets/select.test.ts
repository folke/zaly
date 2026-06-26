// oxlint-disable unicorn/no-await-expression-member
import type { RenderCtx } from "../../src/core/ctx.ts"
import type { Option } from "../../src/widgets/select.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { select } from "../../src/widgets/select.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })

const items = [
  { desc: "show commands", text: "/help" },
  { desc: "exit", text: "/quit" },
  { desc: "pick a model", text: "/model" },
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
      items: [{ name: "Custom", text: "x" }],
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
    m.on("close", fn)
    m.actions["select.close"]()
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
      text: `cmd${i}`,
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
    const manyItems = Array.from({ length: 10 }, (_, i) => ({ name: `cmd${i}`, text: `cmd${i}` }))
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
      text: `cmd${i}`,
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
      text: `cmd${i}`,
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

  test("generic over item type — select payload is typed as T", () => {
    interface Cmd {
      name: string
      text: string
      fn: () => void
    }
    const fn = vi.fn()
    const m = select<Cmd>({ items: [{ fn, text: "/quit", name: "quit" }] })
    m.on("accept", ({ item: it }) => it.fn())
    m.actions["select.accept"]()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("custom render is used for item rows; optionActive still paints selection", async () => {
    interface Row extends Option {
      tag: string
    }
    const m = select<Row>({
      items: [
        { name: "alpha", tag: "alpha", text: "alpha" },
        { name: "beta", tag: "beta", text: "beta" },
        { name: "gamma", tag: "gamma", text: "gamma" },
      ],
      render: (it, renderCtx) => `${renderCtx.active ? "→" : " "} ${it.tag}`,
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
