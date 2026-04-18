import type { RenderCtx, Theme } from "../../src/core/ctx.ts"

import { describe, expect, test, vi } from "vitest"
import { NodeBase } from "../../src/core/node.ts"

const theme: Theme = {
  colors: {
    accent: "#c099ff",
    bg: "#222436",
    dim: "#828bb8",
    err: "#ff757f",
    fg: "#c8d3f5",
    muted: "#636da6",
    ok: "#c3e88d",
    primary: "#82aaff",
    warn: "#ffc777",
  },
  name: "test",
}

const ctx: RenderCtx = { theme, width: 20 }

type S = { text: string; count: number }

class TestNode extends NodeBase<S> {
  renderCalls = 0

  protected _render(rctx: RenderCtx): string[] {
    this.renderCalls++
    return [`${this.state.text}:${this.state.count}:${rctx.width}`]
  }
}

describe("NodeBase", () => {
  test("state proxy reads transparently", () => {
    const n = new TestNode({ count: 3, text: "hi" })
    expect(n.state.text).toBe("hi")
    expect(n.state.count).toBe(3)
  })

  test("fresh node is already dirty: invalidate is a no-op", () => {
    // Per §7.2 short-circuit semantic: cache starts as dirty, so no event
    // fires until something has rendered first.
    const n = new TestNode({ count: 0, text: "hi" })
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.state.text = "bye"
    expect(n.state.text).toBe("bye")
    expect(fn).not.toHaveBeenCalled()
  })

  test("state proxy write invalidates once cache is warm", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render(ctx) // warm the cache → clean state
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.state.text = "bye"
    expect(n.state.text).toBe("bye")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("writing same value does not invalidate", () => {
    const n = new TestNode({ count: 5, text: "hi" })
    n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.state.text = "hi"
    n.state.count = 5
    expect(fn).not.toHaveBeenCalled()
  })

  test("invalidate short-circuits when already dirty", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.state.text = "a"
    n.state.text = "b"
    n.state.text = "c"
    // First mutation invalidates; subsequent are no-ops until next render.
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("setState batches multiple fields into one invalidate", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.setState({ count: 10, text: "new" })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(n.state.text).toBe("new")
    expect(n.state.count).toBe(10)
  })

  test("setState with no real changes does not invalidate", () => {
    const n = new TestNode({ count: 5, text: "hi" })
    n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.setState({ count: 5, text: "hi" })
    expect(fn).not.toHaveBeenCalled()
  })

  test("setState returns this for chaining", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    expect(n.setState({ count: 1 })).toBe(n)
  })

  test("render caches across calls", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    const a = n.render(ctx)
    const b = n.render(ctx)
    expect(a).toEqual(["hi:0:20"])
    expect(b).toBe(a)
    expect(n.renderCalls).toBe(1)
  })

  test("invalidate clears cache so next render recomputes", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render(ctx)
    expect(n.renderCalls).toBe(1)
    n.state.text = "bye"
    n.render(ctx)
    expect(n.renderCalls).toBe(2)
  })

  test("manual invalidate() forces next render to recompute", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render(ctx)
    n.invalidate()
    n.render(ctx)
    expect(n.renderCalls).toBe(2)
  })

  test("invalidate cascades to parent", () => {
    const parent = new TestNode({ count: 0, text: "p" })
    const child = new TestNode({ count: 0, text: "c" })
    child.parent = parent
    const parentFn = vi.fn()
    parent.on("invalidate", parentFn)
    // Warm both caches so invalidate actually fires.
    parent.render(ctx)
    child.render(ctx)
    child.state.text = "c2"
    expect(parentFn).toHaveBeenCalledTimes(1)
  })

  test("cascade short-circuits when parent already dirty", () => {
    const parent = new TestNode({ count: 0, text: "p" })
    const child = new TestNode({ count: 0, text: "c" })
    child.parent = parent
    const parentFn = vi.fn()
    parent.on("invalidate", parentFn)
    parent.render(ctx)
    child.render(ctx)
    child.state.text = "a"
    child.state.text = "b"
    child.state.text = "c"
    expect(parentFn).toHaveBeenCalledTimes(1)
  })

  test("invalidate returns this for chaining", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    expect(n.invalidate()).toBe(n)
  })

  test("different ctx width forces re-render even without invalidation", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render({ theme, width: 10 })
    n.render({ theme, width: 20 })
    expect(n.renderCalls).toBe(2)
  })

  test("different theme content forces re-render", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render({ theme, width: 10 })
    n.render({ theme: { ...theme, name: "other" }, width: 10 })
    expect(n.renderCalls).toBe(2)
  })

  test("same ctx content across fresh objects is a cache hit", () => {
    const n = new TestNode({ count: 0, text: "hi" })
    n.render({ theme, width: 10 })
    // Fresh ctx object with identical content — ohash collapses to same hash.
    n.render({ theme: { ...theme }, width: 10 })
    expect(n.renderCalls).toBe(1)
  })
})
