/**
 * End-to-end tests for the "full virtual buffer + slice to viewport"
 * Stream model with `fixedFooterHeight` support.
 *
 * The invariants we want to preserve:
 *
 *   1. Commits to scrollback only happen when `allRows.length` exceeds
 *      `terminal.rows - fixedFooterHeight`. Footer geometry changes
 *      (autocomplete) never commit rows.
 *
 *   2. Rows committed to scrollback are addressable rows in order
 *      (`allRows[oldCC..newCC-1]`), never overlay residue or pre-zaly
 *      terminal content.
 *
 *   3. Hidden-behind-footer rows are recoverable: when the footer
 *      shrinks back, those rows reappear in the visible region without
 *      having been committed.
 *
 *   4. With `fixedFooterHeight` matching the actual footer size, the
 *      visible region's top row is exactly contiguous with the bottom
 *      of scrollback — no gap.
 */

import { describe, expect, test } from "vitest"
import { box } from "../../src/widgets/box.ts"
import { text } from "../../src/widgets/text.ts"
import { makeHarness } from "./harness.ts"

describe("Stream scrollback — fixedFooterHeight at baseline", () => {
  test("with footer baseline = ui footer height, scrollback ends exactly at visible region top", async () => {
    // Terminal: 10 rows. Footer reserves 2 rows. liveHeight = 8.
    // fixedFooterHeight = 2 → commit threshold = 10 - 2 = 8 = liveHeight.
    // → in steady state, addressable == visible, no hidden rows.
    const h = await makeHarness({ cols: 20, rows: 10, fixedFooterHeight: 2, uiMaxHeight: 5 })
    h.renderer.ui.root.add(box({ flexDirection: "column" }, text("footer-r1"), text("footer-r2")))

    // Append 12 stream rows — overflow by 4 (12 > 8 visible).
    for (let i = 1; i <= 12; i++) {
      h.renderer.stream.append(() => text(`s${i}`))
    }
    await h.flush()

    // Visible region (rows 0..7 in viewport) shows the bottom 8 stream rows.
    expect(h.viewport().slice(0, 8)).toEqual(["s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"])
    // Footer occupies rows 8..9.
    expect(h.viewport()[8]).toContain("footer-r1")
    expect(h.viewport()[9]).toContain("footer-r2")
    // Scrollback contains exactly s1..s4 (the 4 overflow rows),
    // in order, immediately preceding the visible top (s5).
    const sb = h.scrollback().filter((r) => r !== "")
    expect(sb).toEqual(["s1", "s2", "s3", "s4"])
    h.dispose()
  })

  test("fixedFooterHeight = 0 keeps the old behavior (commits at terminal.rows)", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    for (let i = 1; i <= 8; i++) {
      h.renderer.stream.append(() => text(`r${i}`))
    }
    await h.flush()
    expect(h.viewport()).toEqual(["r4", "r5", "r6", "r7", "r8"])
    expect(h.scrollback().filter((r) => r !== "")).toEqual(["r1", "r2", "r3"])
    h.dispose()
  })
})

describe("Stream scrollback — pre-zaly content", () => {
  test("mountAll clears the scroll region so pre-existing terminal bytes don't pollute scrollback", async () => {
    // Pre-paint some "shell prompt" lines BEFORE the renderer takes over.
    // ghostty-web's terminal starts blank, so we write directly through
    // the same write path the harness exposes via the renderer.
    const h = await makeHarness({ cols: 20, rows: 5 })
    // Simulate pre-zaly bytes by writing through the wrapped terminal —
    // this lands as raw bytes before Stream sees anything.
    h.term.write("\x1b[1;1H")
    h.term.write("old-shell-1\n")
    h.term.write("old-shell-2\n")
    h.term.write("old-shell-3\n")

    // Now stream content arrives, eventually overflowing.
    for (let i = 1; i <= 8; i++) {
      h.renderer.stream.append(() => text(`r${i}`))
    }
    await h.flush()
    // Scrollback must contain r1..r3, NOT old-shell-* (those bytes were
    // cleared by mountAll's stale-set seeding).
    const sb = h.scrollback().filter((r) => r !== "")
    expect(sb.some((row) => row.startsWith("old-shell"))).toBe(false)
    expect(sb).toEqual(expect.arrayContaining(["r1", "r2", "r3"]))
    h.dispose()
  })
})

describe("Stream scrollback — footer grow/shrink (autocomplete-like)", () => {
  test("footer grows, then shrinks: no rows lost to scrollback during the transition", async () => {
    // Terminal: 10 rows. Baseline footer: 2 rows. liveHeight = 8.
    // Threshold = 8. Append exactly 8 rows — addressable fills visible.
    const h = await makeHarness({ cols: 20, rows: 10, fixedFooterHeight: 2, uiMaxHeight: 5 })
    h.renderer.ui.root.add(box({ flexDirection: "column" }, text("inp1"), text("inp2")))

    for (let i = 1; i <= 8; i++) {
      h.renderer.stream.append(() => text(`s${i}`))
    }
    await h.flush()
    expect(h.viewport().slice(0, 8)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"])
    expect(h.scrollback().filter((r) => r !== "")).toEqual([])

    // Footer grows by 3 (autocomplete opens). liveHeight = 5.
    h.renderer.ui.root.add(box({ flexDirection: "column" }, text("a1"), text("a2"), text("a3")))
    await h.flush()
    // The top 3 stream rows fall behind the larger footer. They are
    // still in `allRows` (addressable) but not on screen. Crucially,
    // scrollback did NOT pick them up.
    expect(h.scrollback().filter((r) => r !== "")).toEqual([])
    // Visible stream slice: bottom 5 rows (s4..s8).
    expect(h.viewport().slice(0, 5)).toEqual(["s4", "s5", "s6", "s7", "s8"])
    h.dispose()
  })

  test("after footer shrinks back, hidden rows reappear without scrollback churn", async () => {
    const h = await makeHarness({ cols: 20, rows: 10, fixedFooterHeight: 2, uiMaxHeight: 5 })
    h.renderer.ui.root.add(box({ flexDirection: "column" }, text("inp1"), text("inp2")))

    for (let i = 1; i <= 8; i++) {
      h.renderer.stream.append(() => text(`s${i}`))
    }
    await h.flush()

    // Grow the footer.
    const grow = box({ flexDirection: "column" }, text("a1"), text("a2"), text("a3"))
    h.renderer.ui.root.add(grow)
    await h.flush()
    expect(h.viewport().slice(0, 5)).toEqual(["s4", "s5", "s6", "s7", "s8"])

    // Shrink it back. The previously-hidden s1..s3 should return to view.
    h.renderer.ui.root.remove(grow)
    await h.flush()
    expect(h.viewport().slice(0, 8)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"])
    // Scrollback never accumulated rows from the transition.
    expect(h.scrollback().filter((r) => r !== "")).toEqual([])
    h.dispose()
  })
})

describe("Stream scrollback — overflow during footer growth", () => {
  test("streaming new content while footer is grown still commits in correct order", async () => {
    // Terminal: 10 rows. Baseline footer: 2 rows. liveHeight = 8 at
    // baseline. Threshold = 8.
    const h = await makeHarness({ cols: 20, rows: 10, fixedFooterHeight: 2, uiMaxHeight: 5 })
    h.renderer.ui.root.add(box({ flexDirection: "column" }, text("inp1"), text("inp2")))

    for (let i = 1; i <= 8; i++) {
      h.renderer.stream.append(() => text(`s${i}`))
    }
    await h.flush()

    // Grow the footer to 5 rows (liveHeight = 5).
    const grow = box({ flexDirection: "column" }, text("a1"), text("a2"), text("a3"))
    h.renderer.ui.root.add(grow)
    await h.flush()
    // s1..s3 hidden behind the grown footer.

    // Now stream MORE content while the footer is up — pushes
    // addressable past the threshold.
    for (let i = 9; i <= 12; i++) {
      h.renderer.stream.append(() => text(`s${i}`))
    }
    await h.flush()

    // Threshold = 8. allRows = 12 rows. newCC = 4. Commits s1..s4.
    // Even though s1..s3 were hidden behind the footer, the
    // paint-then-`\n` machinery ensures the *addressable* rows land in
    // scrollback in order, not whatever was visually on screen.
    const sb = h.scrollback().filter((r) => r !== "")
    expect(sb).toEqual(["s1", "s2", "s3", "s4"])

    // Visible region (liveHeight=5) shows the bottom 5 addressable
    // rows: s8..s12.
    expect(h.viewport().slice(0, 5)).toEqual(["s8", "s9", "s10", "s11", "s12"])

    // Shrink the footer back to baseline. The 3 rows that were hidden
    // behind the autocomplete (s5..s7) reappear.
    h.renderer.ui.root.remove(grow)
    await h.flush()
    expect(h.viewport().slice(0, 8)).toEqual(["s5", "s6", "s7", "s8", "s9", "s10", "s11", "s12"])
    // Scrollback unchanged.
    expect(h.scrollback().filter((r) => r !== "")).toEqual(["s1", "s2", "s3", "s4"])
    h.dispose()
  })
})

describe("Stream scrollback — large initial nodes", () => {
  test("single appended node taller than liveHeight commits its top rows in order", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    // 12-row node into a 5-row live region: 7 rows must spill.
    const lines = Array.from({ length: 12 }, (_, i) => `r${i + 1}`)
    h.renderer.stream.append(() => text(lines.join("\n")))
    await h.flush()
    expect(h.viewport()).toEqual(["r8", "r9", "r10", "r11", "r12"])
    expect(h.scrollback().filter((r) => r !== "")).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
      "r5",
      "r6",
      "r7",
    ])
    h.dispose()
  })

  test("single appended node taller than terminal commits with fixedFooterHeight active", async () => {
    const h = await makeHarness({ cols: 20, rows: 8, fixedFooterHeight: 2, uiMaxHeight: 4 })
    h.renderer.ui.root.add(box({ flexDirection: "column" }, text("inp1"), text("inp2")))
    // Threshold = 6. 12-row node → 6 rows commit.
    const lines = Array.from({ length: 12 }, (_, i) => `r${i + 1}`)
    h.renderer.stream.append(() => text(lines.join("\n")))
    await h.flush()
    // liveHeight = 6 → visible = r7..r12.
    expect(h.viewport().slice(0, 6)).toEqual(["r7", "r8", "r9", "r10", "r11", "r12"])
    expect(h.scrollback().filter((r) => r !== "")).toEqual(["r1", "r2", "r3", "r4", "r5", "r6"])
    h.dispose()
  })
})

describe("Stream scrollback — diff correctness with commit shift", () => {
  test("streaming one row at a time only writes the new bottom row per frame", async () => {
    // This is the diff-with-commit-shift optimization. Each new row
    // appended past the threshold should result in exactly one
    // commit (\n) plus one terminal write of the new content. We
    // can't easily count writes through ghostty-web, but we can
    // verify the end state is correct after many small appends.
    const h = await makeHarness({ cols: 20, rows: 5, fixedFooterHeight: 2, uiMaxHeight: 2 })
    h.renderer.ui.root.add(box({ flexDirection: "column" }, text("i1"), text("i2")))
    // Threshold = 3. After 10 appends: 7 in scrollback, 3 visible.
    for (let i = 1; i <= 10; i++) {
      h.renderer.stream.append(() => text(`r${i}`))
      await h.flush()
    }
    expect(h.viewport().slice(0, 3)).toEqual(["r8", "r9", "r10"])
    expect(h.scrollback().filter((r) => r !== "")).toEqual([
      "r1",
      "r2",
      "r3",
      "r4",
      "r5",
      "r6",
      "r7",
    ])
    h.dispose()
  })
})
