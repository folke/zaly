import type { Node } from "../../src/core/node.ts"

import { describe, expect, test, vi } from "vitest"
import { createRenderer } from "../../src/index.ts"
import { box } from "../../src/widgets/box.ts"
import { input } from "../../src/widgets/input.ts"
import { text } from "../../src/widgets/text.ts"
import { MockReader, MockWriter } from "./mock.ts"

async function renderer() {
  return createRenderer({
    hookSignals: false,
    stdin: new MockReader(),
    stdout: new MockWriter(40, 20),
  })
}

describe("renderer.getNode — lookup by id", () => {
  test("finds a node tagged with id anywhere in the UI tree", async () => {
    const r = await renderer()
    const a = input().id("editor")
    r.ui.root.add(box({}, a))
    expect(r.getNode("editor")).toBe(a)
  })

  test("finds a node tagged with id attached to the stream", async () => {
    const r = await renderer()
    const t = text("hi").id("greeting")
    r.stream.append(() => t)
    expect(r.getNode("greeting")).toBe(t)
  })

  test("returns undefined when nothing matches", async () => {
    const r = await renderer()
    expect(r.getNode("nope")).toBeUndefined()
  })
})

describe("renderer.findNode — filter by type or predicate", () => {
  test("string argument matches node.type", async () => {
    const r = await renderer()
    const a = input()
    const b = input()
    r.ui.root.add(box({}, a, box({}, b)))
    const found = r.findNode("input")
    expect(found).toHaveLength(2)
    expect(found).toContain(a)
    expect(found).toContain(b)
  })

  test("predicate receives every node and collects matches", async () => {
    const r = await renderer()
    const a = input().id("editor")
    const t = text("label")
    r.ui.root.add(box({}, t, a))
    // The UI root itself carries id="global" (so the router's scope
    // chain reaches it); exclude it to keep the assertion focused.
    const withId = r.findNode((n) => n.id() !== undefined && n !== r.ui.root)
    expect(withId).toEqual([a])
  })

  test("returns empty array when nothing matches", async () => {
    const r = await renderer()
    r.ui.root.add(box({}, text("x")))
    expect(r.findNode("input")).toEqual([])
  })
})

describe("renderer mouse routing", () => {
  test("routes scroll to stream scrolling and left drag to selection", async () => {
    const r = await renderer()
    const scroll = vi.spyOn(r.stream, "scroll").mockResolvedValue(undefined)

    r.input.dispatch({ alt: false, ctrl: false, deltaY: 1, kind: "scroll", meta: false, shift: false, type: "mouse", x: 1, y: 1 })
    expect(scroll).toHaveBeenCalledWith(1)
    expect(r.selection.selection).toBeUndefined()

    r.input.dispatch({ alt: false, button: "left", ctrl: false, kind: "down", meta: false, shift: false, type: "mouse", x: 2, y: 3 })
    r.input.dispatch({ alt: false, button: "left", ctrl: false, kind: "drag", meta: false, shift: false, type: "mouse", x: 5, y: 6 })

    expect(r.selection.selection).toMatchObject({
      anchor: { col: 2, row: 3, surface: "screen" },
      focus: { col: 5, row: 6, surface: "screen" },
    })
    expect(scroll).toHaveBeenCalledTimes(1)
  })

  test("esc clears active selection", async () => {
    const r = await renderer()
    r.input.dispatch({ alt: false, button: "left", ctrl: false, kind: "down", meta: false, shift: false, type: "mouse", x: 2, y: 3 })
    r.input.dispatch({ alt: false, button: "left", ctrl: false, kind: "drag", meta: false, shift: false, type: "mouse", x: 5, y: 6 })
    expect(r.selection.selection).toBeDefined()

    r.input.dispatch({ event: { alt: false, ctrl: false, meta: false, name: "esc", shift: false }, type: "key" })

    expect(r.selection.selection).toBeUndefined()
  })
})

describe("renderer.walk — tree traversal", () => {
  test("visits every node in the UI tree depth-first, parents before children", async () => {
    const r = await renderer()
    const a = text("a")
    const b = text("b")
    const nested = box({}, a, b)
    r.ui.root.add(nested)
    const seen: Node[] = []
    r.walk((n) => {
      seen.push(n)
    })
    // ui.root, nested, a, b — ui.root included so callers can see
    // where they're walking.
    expect(seen[0]).toBe(r.ui.root)
    expect(seen).toContain(nested)
    expect(seen).toContain(a)
    expect(seen).toContain(b)
  })

  test('returning "stop" halts traversal', async () => {
    const r = await renderer()
    const a = text("a")
    const b = text("b")
    r.ui.root.add(box({}, a, b))
    const seen: Node[] = []
    r.walk((n) => {
      seen.push(n)
      if (seen.length === 2) return "stop"
    })
    expect(seen).toHaveLength(2)
  })

  test("walks stream-attached nodes too", async () => {
    const r = await renderer()
    const t = text("stream-side")
    r.stream.append(() => t)
    const seen: Node[] = []
    r.walk((n) => {
      seen.push(n)
    })
    expect(seen).toContain(t)
  })
})
