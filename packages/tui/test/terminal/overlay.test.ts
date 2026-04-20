import { describe, expect, test } from "vitest"

import { box } from "../../src/widgets/box.ts"
import { overlay } from "../../src/widgets/overlay.ts"
import { text } from "../../src/widgets/text.ts"
import { makeHarness } from "./harness.ts"

describe("Overlay surface", () => {
  test("open paints the overlay rows at (x, y)", async () => {
    const h = await makeHarness({ cols: 20, rows: 8 })
    h.renderer.stream.append(text("a\nb\nc\nd\ne\nf\ng\nh"))
    await h.flush()
    // Sanity: stream filled the viewport.
    expect(h.viewport()).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"])

    // Overlay a small two-row box at column 3, row 2.
    const o = overlay({ x: 3, y: 2 }, text("XX"))
    h.renderer.overlay.open(o)
    await h.flush()

    // The overlay's single row "XX" lands at row 2 (1-based → index 1),
    // starting at column 3 (index 2). Other rows stay as stream.
    expect(h.viewport()[0]).toBe("a")
    expect(h.viewport()[1]).toBe("b XX")
    expect(h.viewport()[2]).toBe("c")
    h.dispose()
  })

  test("close overdraws the overlay area by repainting stream + ui", async () => {
    const h = await makeHarness({ cols: 20, rows: 6 })
    h.renderer.stream.append(text("one\ntwo\nthree\nfour\nfive\nsix"))
    await h.flush()
    expect(h.viewport()).toEqual(["one", "two", "three", "four", "five", "six"])

    const o = overlay({ x: 1, y: 3 }, text("MODAL"))
    h.renderer.overlay.open(o)
    await h.flush()
    // Confirm it's actually painted.
    expect(h.viewport()[2]).toBe("MODAL")

    h.renderer.overlay.close(o)
    await h.flush()
    // After close, row 3 must be back to "three".
    expect(h.viewport()).toEqual(["one", "two", "three", "four", "five", "six"])
    h.dispose()
  })

  test("multiple overlays paint in z-order (higher on top)", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    h.renderer.stream.append(text("base"))
    await h.flush()

    const bottom = overlay({ width: 3, x: 1, y: 2, zIndex: 0 }, text("AAA", { width: 3 }))
    const top = overlay({ width: 2, x: 1, y: 2, zIndex: 5 }, text("BB", { width: 2 }))
    h.renderer.overlay.open(bottom)
    h.renderer.overlay.open(top)
    await h.flush()

    // `top` paints 2 cells of "BB" on cols 1-2; `bottom` already placed
    // "AAA" on cols 1-3; net row is "BBA".
    expect(h.viewport()[1]).toBe("BBA")
    h.dispose()
  })

  test("mutating a subtree node re-renders the overlay (dirty → flush)", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    h.renderer.stream.append(text("stream"))
    await h.flush()

    const t = text("hi")
    const o = overlay({ x: 1, y: 2 }, t)
    h.renderer.overlay.open(o)
    await h.flush()
    expect(h.viewport()[1]).toBe("hi")

    t.state.content = "bye"
    await h.flush()
    expect(h.viewport()[1]).toBe("bye")
    h.dispose()
  })

  test("overlay above stream region — no ghosting after \\n scroll", async () => {
    // Stream has only a few rows; overlay at y=5 sits ABOVE the stream
    // tracked region. Before the fix, stream's \n-growth scrolled the
    // overlay bytes up (ghost at y-1) and promoted them into scrollback.
    const h = await makeHarness({ cols: 20, rows: 20 })
    h.renderer.stream.append(text("one\ntwo\nthree"))
    await h.flush()

    const o = overlay({ width: 3, x: 1, y: 5 }, text("OVL", { width: 3 }))
    h.renderer.overlay.open(o)
    await h.flush()
    expect(h.viewport()[4]).toBe("OVL") // row 5 (0-indexed 4)

    // Grow the stream past its old extent so \n fires.
    h.renderer.stream.append(text("a\nb\nc\nd\ne\nf\ng\nh"))
    await h.flush()

    // Overlay still at its absolute y=5 (prefix — the ghostty harness
    // can occasionally retain chars from earlier tests that don't get
    // overdrawn at the right side of the row).
    expect(h.viewport()[4].startsWith("OVL")).toBe(true)
    // The row ABOVE the overlay (y=4, index 3) must NOT carry a shifted
    // copy of "OVL" — that's the ghosting bug.
    expect(h.viewport()[3]).not.toContain("OVL")
    // Scrollback doesn't contain overlay bytes either.
    expect(h.scrollback().some((r) => r.includes("OVL"))).toBe(false)
    h.dispose()
  })

  test("overlay bytes never enter scrollback when stream grows", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    // Fill the region to the brim with stream content.
    h.renderer.stream.append(text("r1\nr2\nr3\nr4\nr5"))
    await h.flush()
    expect(h.viewport()).toEqual(["r1", "r2", "r3", "r4", "r5"])

    // Overlay the middle row. Its bytes sit on top of r3 visually.
    const o = overlay({ width: 3, x: 1, y: 3 }, text("OVL", { width: 3 }))
    h.renderer.overlay.open(o)
    await h.flush()
    expect(h.viewport()[2]).toBe("OVL")

    // Now grow the stream. r1..r3 should scroll into scrollback; none
    // of them should carry overlay bytes. (Checking OVL absence rather
    // than strict equality because the ghostty-web harness can carry
    // some scrollback across tests in the same file.)
    h.renderer.stream.append(text("r6\nr7\nr8"))
    await h.flush()
    const sb = h.scrollback()
    expect(sb.some((r) => r.includes("OVL"))).toBe(false)
    // r1, r2, r3 should be present (in order) somewhere in scrollback.
    const streamRows = sb.filter((r) => /^r\d+$/.test(r))
    expect(streamRows).toEqual(expect.arrayContaining(["r1", "r2", "r3"]))
    h.dispose()
  })

  test("open then immediate close is a no-op on screen", async () => {
    const h = await makeHarness({ cols: 20, rows: 4 })
    h.renderer.stream.append(text("a\nb\nc\nd"))
    await h.flush()
    const o = overlay({ x: 0, y: 1 }, text("X"))
    h.renderer.overlay.open(o)
    h.renderer.overlay.close(o)
    await h.flush()
    expect(h.viewport()).toEqual(["a", "b", "c", "d"])
    h.dispose()
  })
})

describe("Overlay surface — with ui footer", () => {
  test("overlay can overlap the ui footer too", async () => {
    const h = await makeHarness({ cols: 20, rows: 6 })
    h.renderer.stream.append(text("s1\ns2\ns3"))
    h.renderer.ui.root.add(box({}, text("footer")))
    await h.flush()
    // Footer is at the bottom row.
    expect(h.viewport()[5]).toBe("footer")

    // Overlay at the footer row column 1. Use width:1 on the text so it
    // renders as exactly one cell rather than padding to ctx.width.
    const o = overlay({ width: 1, x: 1, y: 6 }, text("!", { width: 1 }))
    h.renderer.overlay.open(o)
    await h.flush()
    expect(h.viewport()[5]).toBe("!ooter")
    h.dispose()
  })
})
