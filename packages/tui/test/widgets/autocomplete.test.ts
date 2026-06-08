import type { RenderCtx } from "../../src/core/ctx.ts"
import type { Option } from "../../src/widgets/select.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { autocomplete } from "../../src/widgets/autocomplete.ts"
import { input } from "../../src/widgets/input.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })

describe("autocomplete", () => {
  test("renders nothing when no trigger matches", async () => {
    const i = input({ value: "hello" })
    await i.render(ctx)
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
    await i.render(ctx)
    const complete = vi.fn(() => [
      { name: "help", value: "/help" },
      { name: "hello", value: "/hello" },
    ])
    const ac = autocomplete({
      input: i,
      sources: {
        slash: { complete, triggers: [/^\s*\//] },
      },
    })
    // Triggering is driven by input state changes; the widget subscribes
    // on construction, so we nudge state to fire the watcher.
    i.state.set({ cursor: 3, value: "/he" })
    // Allow the microtask-queued refresh to run.
    await Promise.resolve()
    expect(complete).toHaveBeenCalledWith("he", expect.any(Function))
    const rows = await ac.render(ctx)
    expect(rows.length).toBeGreaterThan(0)
  })

  test("select replaces trigger + query in input with item.value", async () => {
    const i = input({})
    await i.render(ctx)
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ name: "/help", text: "/help" }],
          triggers: [/^\s*\//],
        },
      },
    })
    i.state.set({ cursor: 3, value: "/he" })
    await Promise.resolve()
    ac.select.actions["select.accept"]()
    expect(i.state.value).toBe("/help ")
    expect(i.state.cursor).toBe("/help ".length)
  })

  test("complete event fires with source name + item", async () => {
    const i = input({})
    await i.render(ctx)
    const cb = vi.fn()
    const item: Option = { name: "quit", text: "/quit" }
    const ac = autocomplete({
      input: i,
      sources: {
        slash: { complete: () => [item], triggers: [/^\s*\//] },
      },
    })
    ac.on("complete", cb)
    i.state.set({ cursor: 1, value: "/" })
    await Promise.resolve()
    ac.select.actions["select.accept"]()
    expect(cb).toHaveBeenCalledWith(
      { item, source: "slash", type: "complete" },
      ac,
      expect.anything()
    )
  })

  test("cancel hides the menu until a new trigger reopens it", async () => {
    const i = input({})
    await i.render(ctx)
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ value: "/help" }],
          triggers: [/^\s*\//],
        },
      },
    })
    i.state.set({ cursor: 3, value: "/he" })
    await Promise.resolve()
    expect(ac.visible).toBe(true)
    ac.select.actions["select.cancel"]()
    expect(ac.visible).toBe(false)
    const rows = await ac.render(ctx)
    expect(rows).toEqual([])
  })

  test("trigger regex on word-boundary (@mention) works mid-text", async () => {
    const i = input({})
    await i.render(ctx)
    const complete = vi.fn(() => [{ text: "@bob" }])
    const ac = autocomplete({
      input: i,
      sources: {
        mention: { complete, triggers: [/\B@/] },
      },
    })
    i.state.set({ cursor: 7, value: "hey @bo" })
    await Promise.resolve()
    expect(complete).toHaveBeenCalledWith("bo", expect.any(Function))
    ac.select.actions["select.accept"]()
    expect(i.state.value).toBe("hey @bob ")
  })

  test("first matching source wins when multiple could apply", async () => {
    const i = input({})
    await i.render(ctx)
    const slashComplete = vi.fn(() => [{ value: "/slash" }])
    const otherComplete = vi.fn(() => [{ value: "/other" }])
    autocomplete({
      input: i,
      sources: {
        other: { complete: otherComplete, triggers: [/^\s*\//] },
        slash: { complete: slashComplete, triggers: [/^\s*\//] },
      },
    })
    i.state.set({ cursor: 2, value: "/x" })
    await Promise.resolve()
    // Sources iterate in object-insertion order; `other` is declared
    // first (after alphabetical sort), so it claims the match.
    expect(otherComplete).toHaveBeenCalled()
    expect(slashComplete).not.toHaveBeenCalled()
  })

  test("accept returning undefined clears the trigger+query range (side-effect source)", async () => {
    const i = input({})
    await i.render(ctx)
    const onAccept = vi.fn(() => undefined)
    const ac = autocomplete({
      input: i,
      sources: {
        cmd: {
          accept: onAccept,
          complete: () => [{ value: "quit" }],
          triggers: [/^\s*\//],
        },
      },
    })
    i.state.set({ cursor: 3, value: "/qu" })
    await Promise.resolve()
    ac.select.actions["select.accept"]()
    expect(onAccept).toHaveBeenCalledWith({ value: "quit" }, "qu")
    // Source handled it; the typed trigger+query gets cleared, nothing
    // is inserted.
    expect(i.state.value).toBe("")
    expect(i.state.cursor).toBe(0)
    expect(ac.visible).toBe(false)
  })

  test("accept returning a string replaces the trigger+query range", async () => {
    const i = input({})
    await i.render(ctx)
    const ac = autocomplete({
      input: i,
      sources: {
        files: {
          accept: (item) => (item as { value: string }).value,
          complete: () => [{ value: "src/index.ts" }],
          triggers: [/(?<=^|\s)@/],
        },
      },
    })
    i.state.set({ cursor: 4, value: "@src" })
    await Promise.resolve()
    ac.select.actions["select.accept"]()
    // No trailing space (files override).
    expect(i.state.value).toBe("src/index.ts")
    expect(i.state.cursor).toBe("src/index.ts".length)
  })

  test("closes when trigger no longer matches", async () => {
    const i = input({})
    await i.render(ctx)
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [{ value: "/help" }],
          triggers: [/^\s*\//],
        },
      },
    })
    i.state.set({ cursor: 3, value: "/he" })
    await Promise.resolve()
    expect(ac.visible).toBe(true)
    i.state.set({ cursor: 5, value: "hello" })
    await Promise.resolve()
    expect(ac.visible).toBe(false)
  })
})
