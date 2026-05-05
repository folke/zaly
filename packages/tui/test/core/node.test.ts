import type { RenderCtx } from "../../src/core/ctx.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Node } from "../../src/core/node.ts"
import { defaultTheme as theme } from "../../src/themes/index.ts"

const ctx: RenderCtx = createCtx({ theme, width: 20 })

interface S {
  text: string
  count: number
}

class TestNode extends Node<S> {
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

  test("invalidate emits on every mutation and always cascades to parent", async () => {
    // Both local and cascade fire on every invalidate. Surfaces dedupe
    // via their own scheduled flag, so the extra parent walks don't
    // produce extra renders. We can't safely skip the cascade based on
    // cache state because a node may intentionally skip caching (when
    // a mid-render mutation makes the rows stale) — and the next
    // invalidate must still dirty the parent so the surface schedules
    // a fresh paint.
    const parent = new TestNode({ count: 0, text: "p" })
    const child = new TestNode({ count: 0, text: "c" })
    parent.add(child)
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
    expect(parentFn).toHaveBeenCalledTimes(3)
  })

  test("visible: false renders no rows without calling _render", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    ;(n.state as { visible?: boolean }).visible = false
    const rows = await n.render(ctx)
    expect(rows).toEqual([])
    expect(n.renderCalls).toBe(0)
  })

  test("visible: true (or unset) renders normally", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    const rows = await n.render(ctx)
    expect(rows).toEqual(["hi:0:20"])
    ;(n.state as { visible?: boolean }).visible = true
    const rows2 = await n.render(ctx)
    expect(rows2).toEqual(["hi:0:20"])
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
    parent.add(child)
    const parentFn = vi.fn()
    parent.on("invalidate", parentFn)
    // Warm both caches so invalidate actually fires.
    await parent.render(ctx)
    await child.render(ctx)
    child.state.text = "c2"
    expect(parentFn).toHaveBeenCalledTimes(1)
  })

  test("cascade fires on every mutation; surfaces own the dedupe", async () => {
    // Previously the cascade short-circuited on back-to-back writes,
    // but that was unsafe: a node whose render skips caching (because
    // a child mutation landed mid-render) would never dirty its parent
    // again. Surfaces dedupe at their own `scheduled` flag, so the
    // per-invalidate cost is one tree walk + emit — cheap.
    const parent = new TestNode({ count: 0, text: "p" })
    const child = new TestNode({ count: 0, text: "c" })
    parent.add(child)
    const parentFn = vi.fn()
    parent.on("invalidate", parentFn)
    await parent.render(ctx)
    await child.render(ctx)
    child.state.text = "a"
    child.state.text = "b"
    child.state.text = "c"
    expect(parentFn).toHaveBeenCalledTimes(3)
  })

  test("invalidate returns this for chaining", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    expect(n.invalidate()).toBe(n)
  })

  test("bumping ctx.version forces re-render even without invalidation", async () => {
    // The Renderer bumps `version` on resize / theme swap; bare callers
    // pass it explicitly. Same-version ctxs → cache hit; different
    // version → recompute.
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(createCtx({ theme, version: 1, width: 10 }))
    await n.render(createCtx({ theme, version: 2, width: 20 }))
    expect(n.renderCalls).toBe(2)
  })

  test("same version across ctxs is a cache hit", async () => {
    const n = new TestNode({ count: 0, text: "hi" })
    await n.render(createCtx({ theme, version: 1, width: 10 }))
    // Same version — regardless of content — collapses to the cached rows.
    await n.render(createCtx({ theme, version: 1, width: 10 }))
    expect(n.renderCalls).toBe(1)
  })
})

describe("Node.splice", () => {
  const mk = (tag: string): TestNode => new TestNode({ count: 0, text: tag })

  test("add appends to the end", () => {
    const parent = mk("p")
    const a = mk("a")
    const b = mk("b")
    parent.add(a).add(b)
    expect(parent.children).toEqual([a, b])
    expect(a.parent).toBe(parent)
    expect(b.parent).toBe(parent)
  })

  test("remove detaches and clears parent", () => {
    const parent = mk("p")
    const a = mk("a")
    parent.add(a)
    const removed = vi.fn()
    parent.on("childremoved", removed)
    parent.remove(a)
    expect(parent.children).toEqual([])
    expect(a.parent).toBeUndefined()
    expect(removed).toHaveBeenCalledWith({ child: a, type: "childremoved" }, expect.anything())
  })

  test("adding an existing child does not duplicate", () => {
    // Plugins that idempotently re-inject a widget would otherwise
    // double-render it on every pass — keep `splice` reentrant.
    const parent = mk("p")
    const a = mk("a")
    parent.add(a)
    parent.add(a)
    expect(parent.children).toEqual([a])
  })

  test("splice can reorder an existing child without duplicating", () => {
    const parent = mk("p")
    const a = mk("a")
    const b = mk("b")
    const c = mk("c")
    parent.splice(0, 0, a, b, c)
    expect(parent.children).toEqual([a, b, c])
    // Move `a` to the end.
    parent.splice(parent.children.length, 0, a)
    expect(parent.children).toEqual([b, c, a])
    expect(parent.children.length).toBe(3)
  })

  test("splice rejects self-insertion (would create a cycle)", () => {
    const parent = mk("p")
    parent.splice(0, 0, parent)
    expect(parent.children).toEqual([])
    expect(parent.parent).toBeUndefined()
  })

  test("moving a child to a new parent detaches it from the old one", () => {
    const a = mk("a")
    const b = mk("b")
    const c = mk("c")
    a.add(c)
    const aRemoved = vi.fn()
    const bAdded = vi.fn()
    a.on("childremoved", aRemoved)
    b.on("childadded", bAdded)
    b.add(c)
    expect(a.children).toEqual([])
    expect(b.children).toEqual([c])
    expect(c.parent).toBe(b)
    expect(aRemoved).toHaveBeenCalledWith({ child: c, type: "childremoved" }, expect.anything())
    expect(bAdded).toHaveBeenCalledWith({ child: c, type: "childadded" }, expect.anything())
  })

  test("splice insertion + deletion in a single call", () => {
    const parent = mk("p")
    const a = mk("a")
    const b = mk("b")
    const c = mk("c")
    parent.splice(0, 0, a, b)
    const added = vi.fn()
    const removed = vi.fn()
    parent.on("childadded", added)
    parent.on("childremoved", removed)
    // Replace b with c.
    parent.splice(1, 1, c)
    expect(parent.children).toEqual([a, c])
    expect(b.parent).toBeUndefined()
    expect(c.parent).toBe(parent)
    expect(removed).toHaveBeenCalledWith({ child: b, type: "childremoved" }, expect.anything())
    expect(added).toHaveBeenCalledWith({ child: c, type: "childadded" }, expect.anything())
  })

  test("clear removes every child and fires childremoved for each", () => {
    const parent = mk("p")
    const a = mk("a")
    const b = mk("b")
    parent.add(a).add(b)
    const removed = vi.fn()
    parent.on("childremoved", removed)
    parent.clear()
    expect(parent.children).toEqual([])
    expect(a.parent).toBeUndefined()
    expect(b.parent).toBeUndefined()
    expect(removed).toHaveBeenCalledTimes(2)
  })

  test("splice clamps out-of-range start", () => {
    // Array#splice would treat negative `start` as an offset from the
    // end. We clamp to [0, length] since tree insertions don't have a
    // meaningful "from the end" interpretation.
    const parent = mk("p")
    const a = mk("a")
    const b = mk("b")
    parent.splice(999, 0, a)
    parent.splice(-5, 0, b)
    expect(parent.children).toEqual([b, a])
  })
})
