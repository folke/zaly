import type { RenderCtx } from "../../src/core/ctx.ts"
import type { ScoredItem } from "../../src/search/index.ts"
import type { Option } from "../../src/widgets/select.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { defaultTheme as theme } from "../../src/themes/registry.ts"
import { autocomplete } from "../../src/widgets/autocomplete.ts"
import { input } from "../../src/widgets/input.ts"

const ctx: RenderCtx = createCtx({ theme, width: 40 })
const scored = <T extends Option>(option: T): ScoredItem<T> => ({ ...option, score: 1 })

describe("autocomplete", () => {
  test("renders nothing when no trigger matches", async () => {
    const i = input({ value: "hello" })
    await i.render(ctx)
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [scored({ text: "/help" })],
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
      scored({ name: "help", text: "/help" }),
      scored({ name: "hello", text: "/hello" }),
    ])
    const ac = autocomplete({
      input: i,
      sources: {
        slash: { complete, triggers: [/^\s*\//] },
      },
    })
    i.state.set({ cursor: 3, value: "/he" })
    await Promise.resolve()
    expect(complete).toHaveBeenCalledWith("he", expect.any(Function))
    const rows = await ac.render(ctx)
    expect(rows.length).toBeGreaterThan(0)
  })

  test("select replaces trigger + query in input with item.text", async () => {
    const i = input({})
    await i.render(ctx)
    const ac = autocomplete({
      input: i,
      sources: {
        slash: {
          complete: () => [scored({ name: "/help", text: "/help" })],
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
    const picked = scored({ name: "quit", text: "/quit" })
    const ac = autocomplete({
      input: i,
      sources: {
        slash: { complete: () => [picked], triggers: [/^\s*\//] },
      },
    })
    ac.on("complete", cb)
    i.state.set({ cursor: 1, value: "/" })
    await Promise.resolve()
    ac.select.actions["select.accept"]()
    expect(cb).toHaveBeenCalledWith(
      { item: picked, source: "slash", type: "complete" },
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
          complete: () => [scored({ text: "/help" })],
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
    const complete = vi.fn(() => [scored({ text: "@bob" })])
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
    const slashComplete = vi.fn(() => [scored({ text: "/slash" })])
    const otherComplete = vi.fn(() => [scored({ text: "/other" })])
    autocomplete({
      input: i,
      sources: {
        other: { complete: otherComplete, triggers: [/^\s*\//] },
        slash: { complete: slashComplete, triggers: [/^\s*\//] },
      },
    })
    i.state.set({ cursor: 2, value: "/x" })
    await Promise.resolve()
    expect(otherComplete).toHaveBeenCalled()
    expect(slashComplete).not.toHaveBeenCalled()
  })

  test("accept returning undefined clears the trigger+query range (side-effect source)", async () => {
    const i = input({})
    await i.render(ctx)
    const onAccept = vi.fn(() => undefined)
    const picked = scored({ text: "quit" })
    const ac = autocomplete({
      input: i,
      sources: {
        cmd: {
          accept: onAccept,
          complete: () => [picked],
          triggers: [/^\s*\//],
        },
      },
    })
    i.state.set({ cursor: 3, value: "/qu" })
    await Promise.resolve()
    ac.select.actions["select.accept"]()
    expect(onAccept).toHaveBeenCalledWith(picked, "qu")
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
          accept: (option) => option.text,
          complete: () => [scored({ text: "src/index.ts" })],
          triggers: [/(?<=^|\s)@/],
        },
      },
    })
    i.state.set({ cursor: 4, value: "@src" })
    await Promise.resolve()
    ac.select.actions["select.accept"]()
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
          complete: () => [scored({ text: "/help" })],
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
