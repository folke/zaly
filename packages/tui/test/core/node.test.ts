import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { NodeBase } from "../../src/core/node.ts"
import { moon as theme } from "../../src/style/theme.ts"

const ctx: RenderCtx = createCtx({ theme, width: 20 })

type S = { text: string; count: number }

class TestNode extends NodeBase<S> {
  renderCalls = 0

  protected _render(rctx: RenderCtx): string[] {
    this.renderCalls++
    return [`${this.state.text}:${this.state.count}:${rctx.width}`]
  }
}

describe("NodeBase", () => {
  test("state proxy reads transparently", async () => {
    const n = new TestNode({ count: 3, text: "hi" })
    expect(n.state.text).toBe("hi")
    expect(n.state.count).toBe(3)
  })

  test("fresh node still emits on state mutation so surfaces can pick up first render", async () => {
    // Emit is unconditional — surfaces (Stream, UI) subscribe before
    // the first render, and need to be told that a not-yet-rendered
    // node wants a flush. They dedupe internally.
    const n = new TestNode({ count: 0, text: "hi" })
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.state.text = "bye"
    expect(n.state.text).toBe("bye")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("state proxy write invalidates once cache is warm", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(ctx) // warm the cache → clean state
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.state.text = "bye"
    expect(n.state.text).toBe("bye")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("writing same value does not invalidate", async () => {
    const n = new TestNode({ count: 5, text: "hi" })
    await n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.state.text = "hi"
    n.state.count = 5
    expect(fn).not.toHaveBeenCalled()
  })

  test("invalidate emits on every mutation; parent cascade only on the first", async () => {
    // Local emit is cheap and surfaces dedupe via their own scheduled
    // flag, so we don't short-circuit it. The parent cascade *is*
    // short-circuited — that's the optimization that keeps 500 rapid
    // mutations from walking the whole tree 500 times.
    const parent = new TestNode({ count: 0, text: "p" })
    const child = new TestNode({ count: 0, text: "c" })
    child.parent = parent
    await parent.render(ctx)
    await child.render(ctx)

    const localFn = vi.fn()
    const parentFn = vi.fn()
    child.on("invalidate", localFn)
    parent.on("invalidate", parentFn)

    child.state.text = "a"
    child.state.text = "b"
    child.state.text = "c"

    expect(localFn).toHaveBeenCalledTimes(3)
    expect(parentFn).toHaveBeenCalledTimes(1)
  })

  test("setState batches multiple fields into one invalidate", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.setState({ count: 10, text: "new" })
    expect(fn).toHaveBeenCalledTimes(1)
    expect(n.state.text).toBe("new")
    expect(n.state.count).toBe(10)
  })

  test("setState with no real changes does not invalidate", async () => {
    const n = new TestNode({ count: 5, text: "hi" })
    await n.render(ctx)
    const fn = vi.fn()
    n.on("invalidate", fn)
    n.setState({ count: 5, text: "hi" })
    expect(fn).not.toHaveBeenCalled()
  })

  test("setState returns this for chaining", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    expect(n.setState({ count: 1 })).toBe(n)
  })

  test("render caches across calls", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    const a = await n.render(ctx)
    const b = await n.render(ctx)
    expect(a).toEqual(["hi:0:20"])
    expect(b).toBe(a)
    expect(n.renderCalls).toBe(1)
  })

  test("invalidate clears cache so next render recomputes", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(ctx)
    expect(n.renderCalls).toBe(1)
    n.state.text = "bye"
    await n.render(ctx)
    expect(n.renderCalls).toBe(2)
  })

  test("manual invalidate() forces next render to recompute", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(ctx)
    n.invalidate()
    await n.render(ctx)
    expect(n.renderCalls).toBe(2)
  })

  test("invalidate cascades to parent", async () => {
    const parent = new TestNode({ count: 0, text: "p" })
    const child = new TestNode({ count: 0, text: "c" })
    child.parent = parent
    const parentFn = vi.fn()
    parent.on("invalidate", parentFn)
    // Warm both caches so invalidate actually fires.
    await parent.render(ctx)
    await child.render(ctx)
    child.state.text = "c2"
    expect(parentFn).toHaveBeenCalledTimes(1)
  })

  test("cascade short-circuits when parent already dirty", async () => {
    const parent = new TestNode({ count: 0, text: "p" })
    const child = new TestNode({ count: 0, text: "c" })
    child.parent = parent
    const parentFn = vi.fn()
    parent.on("invalidate", parentFn)
    await parent.render(ctx)
    await child.render(ctx)
    child.state.text = "a"
    child.state.text = "b"
    child.state.text = "c"
    expect(parentFn).toHaveBeenCalledTimes(1)
  })

  test("invalidate returns this for chaining", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    expect(n.invalidate()).toBe(n)
  })

  test("different ctx width forces re-render even without invalidation", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(createCtx({ theme, width: 10 }))
    await n.render(createCtx({ theme, width: 20 }))
    expect(n.renderCalls).toBe(2)
  })

  test("different theme content forces re-render", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(createCtx({ theme, width: 10 }))
    await n.render(createCtx({ theme: { ...theme, primary: "#000000" }, width: 10 }))
    expect(n.renderCalls).toBe(2)
  })

  test("same ctx content across fresh objects is a cache hit", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(createCtx({ theme, width: 10 }))
    // Fresh ctx object with identical content — sha256 collapses to same key.
    await n.render(createCtx({ theme: { ...theme }, width: 10 }))
    expect(n.renderCalls).toBe(1)
  })
})
