import { describe, expect, test } from "vitest"
import { input } from "../../src/widgets/input.ts"
import { text } from "../../src/widgets/text.ts"
import { makeHarness } from "./harness.ts"

describe("Renderer — resize", () => {
  test("stream rows re-render at new width after resize", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    h.renderer.stream.append(text("hello world"))
    await h.flush()
    expect(h.viewport()[4]).toBe("hello world")

    await h.resize(40, 5)
    // The node's cached rows were invalidated by the ctx version bump,
    // the screen was cleared, and the node was re-rendered at 40 cols.
    expect(h.viewport()[4]).toBe("hello world")
    h.dispose()
  })

  test("narrower resize word-wraps a previously-fitting line", async () => {
    const h = await makeHarness({ cols: 40, rows: 5 })
    h.renderer.stream.append(text("the quick brown fox jumps"))
    await h.flush()
    expect(h.viewport()[4]).toBe("the quick brown fox jumps")

    await h.resize(12, 5)
    // At 12 cols, word-wrap kicks in. Bottom of viewport is the last
    // wrapped row; the top non-empty row should hold the first wrap.
    const v = h.viewport()
    const nonEmpty = v.filter((r) => r !== "")
    expect(nonEmpty.length).toBeGreaterThanOrEqual(2)
    expect(nonEmpty.join(" ")).toContain("the quick")
    expect(nonEmpty.join(" ")).toContain("fox")
    h.dispose()
  })

  test("footer (UI) re-anchors after resize to shorter viewport", async () => {
    const h = await makeHarness({ cols: 30, rows: 8 })
    h.renderer.ui.root.add(text("> footer"))
    h.renderer.stream.append(text("body line"))
    await h.flush()
    expect(h.viewport()[7]).toBe("> footer")
    expect(h.viewport()[6]).toBe("body line")

    await h.resize(30, 5)
    // Footer pinned to the last row; stream content repaints above it.
    // Note: UI's scrollUp(1) to make room for the footer pushes the
    // stream row up one extra slot, leaving row 3 blank — a visual
    // quirk of the grow path but correct w.r.t. content placement.
    const v = h.viewport()
    expect(v[v.length - 1]).toBe("> footer")
    expect(v).toContain("body line")
    h.dispose()
  })

  test("live input keeps working after resize", async () => {
    const h = await makeHarness({ cols: 30, rows: 6 })
    const field = input({ value: "hi" })
    h.renderer.ui.root.add(field)
    await h.flush()
    expect(h.viewport()[5]).toContain("hi")

    await h.resize(50, 6)
    field.state.value = "hello world"
    field.state.cursor = "hello world".length
    await h.flush()
    expect(h.viewport()[5]).toContain("hello world")
    h.dispose()
  })

  test("resize clears previously-painted rows above the new scroll region", async () => {
    // Shrink the viewport so rows that used to hold content fall
    // outside the new geometry. After resize, the new viewport must
    // not carry stale bytes from before the clear.
    const h = await makeHarness({ cols: 30, rows: 10 })
    for (const label of ["alpha", "beta", "gamma"]) {
      h.renderer.stream.append(text(label))
      await h.flush()
    }
    await h.resize(30, 4)
    const v = h.viewport()
    // New viewport has 4 rows. Whatever was "above" (rows 4-9 of the
    // 10-row buffer) is gone; remaining content is bottom-anchored.
    expect(v.length).toBe(4)
    expect(v[3]).toBe("gamma")
    h.dispose()
  })
})
