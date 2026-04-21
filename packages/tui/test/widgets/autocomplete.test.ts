import type { RenderCtx } from "../../src/core/ctx.ts"
import type { MenuItem } from "../../src/widgets/menu.ts"

import type { RoutedKey } from "../../src/input/router.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { moon as theme } from "../../src/style/theme.ts"
import { autocomplete } from "../../src/widgets/autocomplete.ts"
import { input } from "../../src/widgets/input.ts"
import { mockMountCtx } from "../renderer/mock.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })

describe("autocomplete", () => {
  test("renders nothing when no trigger matches", async () => {
    const i = input({ value: "hello" })
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ value: "/help" }],
          triggers: [/^\s*\//],
        },
      },
    })
    const rows = await ac.render(ctx)
    expect(rows).toEqual([])
  })

  test("detects trigger and calls complete with query", async () => {
    const i = input({})
    const complete = vi.fn(() => [{ value: "/help" }, { value: "/hello" }])
    const ac = autocomplete({
      input: i,
      sources: {
        slash: { complete, triggers: [/^\s*\//] },
      },
    })
    // Triggering is driven by input state changes; the widget subscribes
    // on construction, so we nudge state to fire the watcher.
    i.setState({ cursor: 3, value: "/he" })
    // Allow the microtask-queued refresh to run.
    await Promise.resolve()
    expect(complete).toHaveBeenCalledWith("he")
    const rows = await ac.render(ctx)
    expect(rows.length).toBeGreaterThan(0)
  })

  test("select replaces trigger + query in input with item.value", async () => {
    const i = input({})
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ value: "/help" }],
          triggers: [/^\s*\//],
        },
      },
    })
    i.setState({ cursor: 3, value: "/he" })
    await Promise.resolve()
    ac.menu.actions["menu.select"]()
    expect(i.state.value).toBe("/help ")
    expect(i.state.cursor).toBe("/help ".length)
  })

  test("onComplete callback fires with source name + item", async () => {
    const i = input({})
    const cb = vi.fn()
    const item: MenuItem = { value: "/quit" }
    const ac = autocomplete({
      input: i,
      onComplete: cb,
      sources: {
        slash: { complete: () => [item], triggers: [/^\s*\//] },
      },
    })
    i.setState({ cursor: 1, value: "/" })
    await Promise.resolve()
    ac.menu.actions["menu.select"]()
    expect(cb).toHaveBeenCalledWith("slash", item)
  })

  test("cancel hides the menu until a new trigger reopens it", async () => {
    const i = input({})
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ value: "/help" }],
          triggers: [/^\s*\//],
        },
      },
    })
    i.setState({ cursor: 3, value: "/he" })
    await Promise.resolve()
    expect(ac.open).toBe(true)
    ac.menu.actions["menu.cancel"]()
    expect(ac.open).toBe(false)
    const rows = await ac.render(ctx)
    expect(rows).toEqual([])
  })

  test("trigger regex on word-boundary (@mention) works mid-text", async () => {
    const i = input({})
    const complete = vi.fn(() => [{ value: "@bob" }])
    const ac = autocomplete({
      input: i,
      sources: {
        mention: { complete, triggers: [/\B@/] },
      },
    })
    i.setState({ cursor: 7, value: "hey @bo" })
    await Promise.resolve()
    expect(complete).toHaveBeenCalledWith("bo")
    ac.menu.actions["menu.select"]()
    expect(i.state.value).toBe("hey @bob ")
  })

  test("first matching source wins when multiple could apply", async () => {
    const i = input({})
    const slashComplete = vi.fn(() => [{ value: "/slash" }])
    const otherComplete = vi.fn(() => [{ value: "/other" }])
    autocomplete({
      input: i,
      sources: {
        other: { complete: otherComplete, triggers: [/^\s*\//] },
        slash: { complete: slashComplete, triggers: [/^\s*\//] },
      },
    })
    i.setState({ cursor: 2, value: "/x" })
    await Promise.resolve()
    // Sources iterate in object-insertion order; `other` is declared
    // first (after alphabetical sort), so it claims the match.
    expect(otherComplete).toHaveBeenCalled()
    expect(slashComplete).not.toHaveBeenCalled()
  })

  test("bindKeys routes up/down/enter/esc to the menu while open", async () => {
    const i = input({})
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ value: "/a" }, { value: "/b" }, { value: "/c" }],
          triggers: [/^\s*\//],
        },
      },
    })
    // Mount the autocomplete + input subtree (via the input's subtree,
    // since ac wraps the input's own key events) so ctx.actions is
    // available.
    ac.mount(mockMountCtx("ui"))
    ac.bindKeys()
    i.setState({ cursor: 1, value: "/" })
    await Promise.resolve()
    expect(ac.open).toBe(true)

    const keyEv = (name: string): RoutedKey => {
      const ev: RoutedKey = {
        alt: false,
        ctrl: false,
        meta: false,
        name,
        pattern: name,
        shift: false,
        stop: () => {
          ev.stopped = true
        },
        stopped: false,
      }
      return ev
    }

    expect(ac.menu.state.active).toBe(0)
    i.emit("key", keyEv("down"))
    expect(ac.menu.state.active).toBe(1)
    i.emit("key", keyEv("up"))
    expect(ac.menu.state.active).toBe(0)
    i.emit("key", keyEv("enter"))
    expect(i.state.value).toBe("/a ")
    expect(ac.open).toBe(false)
  })

  test("closes when trigger no longer matches", async () => {
    const i = input({})
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ value: "/help" }],
          triggers: [/^\s*\//],
        },
      },
    })
    i.setState({ cursor: 3, value: "/he" })
    await Promise.resolve()
    expect(ac.open).toBe(true)
    i.setState({ cursor: 5, value: "hello" })
    await Promise.resolve()
    expect(ac.open).toBe(false)
  })
})
