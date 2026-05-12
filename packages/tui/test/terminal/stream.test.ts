import { describe, expect, test } from "vitest"
import { text } from "../../src/widgets/text.ts"
import { makeHarness } from "./harness.ts"

describe("Stream — viewport correctness", () => {
  test("single append lands at the bottom", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    h.renderer.stream.append(() => text("hello"))
    await h.flush()
    expect(h.viewport()[4]).toBe("hello")
    expect(
      h
        .viewport()
        .slice(0, 4)
        .every((r) => r === "")
    ).toBe(true)
    h.dispose()
  })

  test("sequential appends stack bottom-anchored while fitting", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    for (const label of ["a", "b", "c"]) {
      h.renderer.stream.append(() => text(label))
      await h.flush()
    }
    expect(h.viewport()).toEqual(["", "", "a", "b", "c"])
    h.dispose()
  })

  test("mutations on the live tail re-render in place", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    const t = text("draft")
    h.renderer.stream.append(() => t)
    await h.flush()
    t.state.content = "final"
    await h.flush()
    expect(h.viewport()[4]).toBe("final")
    h.dispose()
  })
})

describe("Stream — overflow & scrollback", () => {
  test("N sequential appends past liveHeight: oldest scroll into scrollback, newest visible", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    for (let i = 1; i <= 10; i++) {
      h.renderer.stream.append(() => text(String(i)))
      await h.flush()
    }
    expect(h.viewport()).toEqual(["6", "7", "8", "9", "10"])
    // The first 5 appends spill into scrollback in order. Any blanks
    // that rode above the content are artifacts of initial terminal
    // state — drop those from the assertion.
    const sb = h.scrollback().filter((r) => r !== "")
    expect(sb).toEqual(["1", "2", "3", "4", "5"])
    h.dispose()
  })

  test("appends within one tick also spill correctly", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    for (let i = 1; i <= 10; i++) h.renderer.stream.append(() => text(String(i)))
    await h.flush()
    expect(h.viewport()).toEqual(["6", "7", "8", "9", "10"])
    expect(h.scrollback().filter((r) => r !== "")).toEqual(["1", "2", "3", "4", "5"])
    h.dispose()
  })

  test("a single node taller than liveHeight still renders correctly", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    // Twelve logical rows in one node — more than liveHeight (=5).
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

  test("a live tail that grows past liveHeight spills its older rows", async () => {
    const h = await makeHarness({ cols: 20, rows: 5 })
    const t = text("r1\nr2\nr3")
    h.renderer.stream.append(() => t)
    await h.flush()
    expect(h.viewport()).toEqual(["", "", "r1", "r2", "r3"])

    // Grow the same node past the region.
    t.state.content = "r1\nr2\nr3\nr4\nr5\nr6\nr7\nr8"
    await h.flush()
    expect(h.viewport()).toEqual(["r4", "r5", "r6", "r7", "r8"])
    expect(h.scrollback().filter((r) => r !== "")).toEqual(["r1", "r2", "r3"])
    h.dispose()
  })
})

describe("Stream — live / frozen nodes", () => {
  test("mutating a node past the maxLive window does not re-render it", async () => {
    const h = await makeHarness({ cols: 20, rows: 10 })
    // maxLive defaults to 3. Append four nodes — the first is forced
    // non-live once the fourth arrives.
    const first = text("first")
    const second = text("second")
    const third = text("third")
    const fourth = text("fourth")
    h.renderer.stream.append(() => first)
    h.renderer.stream.append(() => second)
    h.renderer.stream.append(() => third)
    h.renderer.stream.append(() => fourth)
    await h.flush()
    expect(h.viewport().slice(-4)).toEqual(["first", "second", "third", "fourth"])

    // Mutate the (now frozen) first. Nothing should change.
    first.state.content = "CHANGED"
    await h.flush()
    expect(h.viewport().slice(-4)).toEqual(["first", "second", "third", "fourth"])

    // Mutate one that's still inside the live window.
    third.state.content = "THIRD!"
    await h.flush()
    expect(h.viewport().slice(-4)).toEqual(["first", "second", "THIRD!", "fourth"])

    h.dispose()
  })
})

describe("Stream.commit", () => {
  test("commit({ keep: 1 }) freezes all but the last node", async () => {
    const h = await makeHarness({ cols: 20, rows: 10 })
    const a = text("a")
    const b = text("b")
    h.renderer.stream.append(() => a)
    h.renderer.stream.append(() => b)
    await h.flush()
    h.renderer.stream.commit({ keep: 1, render: false })

    a.state.content = "A!"
    b.state.content = "B!"
    await h.flush()
    // a was frozen → stale. b is still live → updated.
    expect(h.viewport()[8]).toBe("a")
    expect(h.viewport()[9]).toBe("B!")
    h.dispose()
  })
})
