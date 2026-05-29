import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { spinner, Spinner, spinnerFrames } from "../../src/widgets/spinner.ts"
import { mockMountCtx } from "../renderer/mock.ts"

let now = 0
const origNow = performance.now.bind(performance)

beforeEach(() => {
  now = 0
  ;(performance as unknown as { now: () => number }).now = () => now
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] })
})
afterEach(() => {
  vi.useRealTimers()
  ;(performance as unknown as { now: () => number }).now = origNow
})

function setTime(ms: number): void {
  now = ms
}

describe("Spinner.tick", () => {
  test("is a pure function of performance.now() and speed", () => {
    setTime(0)
    expect(Spinner.tick(80)).toBe(0)
    setTime(79)
    expect(Spinner.tick(80)).toBe(0)
    setTime(80)
    expect(Spinner.tick(80)).toBe(1)
    setTime(800)
    expect(Spinner.tick(80)).toBe(10)
  })

  test("two spinners with the same speed agree on the frame regardless of render cadence", () => {
    setTime(320) // 4 ticks at speed=80
    expect(Spinner.tick(80)).toBe(4)
    // A later Spinner.tick(80) at the same time stamp must agree.
    expect(Spinner.tick(80)).toBe(4)
  })
})

describe("spinner()", () => {
  test("picks a frame based on wall time, not render count", async () => {
    const ctx = createCtx({ width: 40 })
    const s = spinner({ frames: ["A", "B", "C", "D"] })

    setTime(0)
    const [row0] = await s.render(ctx)
    expect(row0).toContain("A")

    // Render five more times at t=0 — still frame 0.
    for (let i = 0; i < 5; i++) await s.render(ctx)
    setTime(160) // 2 ticks at speed=80 → frame index 2 → "C"
    s.invalidate()
    const [rowLate] = await s.render(ctx)
    expect(rowLate).toContain("C")

    s.stop()
  })

  test("defaults: dots frames and primary color wrapper", async () => {
    const ctx = createCtx({ width: 40 })
    const s = spinner()
    setTime(0)
    const [row] = await s.render(ctx)
    // First dots frame.
    expect(row).toContain(spinnerFrames.dots[0])
    // Wrapped in an SGR fg run, closed with RESET.
    expect(row.startsWith("\x1b[")).toBe(true)
    expect(row.endsWith("\x1b[0m")).toBe(true)
    s.stop()
  })

  test("mount auto-starts the interval; unmount cancels it", () => {
    const s = spinner()
    const spy = vi.spyOn(s, "invalidate")

    // Mount → interval starts; timer ticks fire invalidate.
    s.mount(mockMountCtx("stream"))
    vi.advanceTimersByTime(200)
    expect(spy).toHaveBeenCalled()

    spy.mockClear()
    s.unmount()
    vi.advanceTimersByTime(1000)
    // No more ticks after unmount.
    expect(spy).not.toHaveBeenCalled()
  })
})
