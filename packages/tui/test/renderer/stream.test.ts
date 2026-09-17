// oxlint-disable unicorn/consistent-function-scoping
import { describe, expect, test } from "vitest"
import { createAsync, memo } from "../../src/core/reactive.ts"
import { Renderer } from "../../src/renderer/renderer.ts"
import { text } from "../../src/widgets/text.ts"
import { autoStop, MockReader, MockWriter } from "./mock.ts"

const track = autoStop()

function mount(cols = 20, rows = 10) {
  const stdout = new MockWriter(cols, rows)
  const renderer = new Renderer({ hookSignals: false, stdin: new MockReader(), stdout })
  const { stream, terminal } = renderer
  terminal.start()
  track(terminal)
  stdout.clear()
  // Tests exercise Stream in isolation (no Renderer present). Self-
  // schedule on `"dirty"` so `stream.add(...)` still eventually renders
  // when awaiting microtasks, mirroring the Renderer's behaviour.
  let scheduled = false
  renderer.on("dirty", () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      void stream.render()
    })
  })
  return { stdout, stream, terminal, renderer }
}

// Drain enough microtasks that the scheduled render + flush chain
// completes. Four ticks covers schedule → flush() → await render() →
// write loop.
async function drain() {
  // Sequential awaits (not Promise.all) — each one drains one microtask
  // tick, which is exactly the point.
  for (let i = 0; i < 18; i++) await Promise.resolve()
}

describe("Stream selection coordinates", () => {
  test("maps visible short stream rows between screen and stream coordinates", async () => {
    const { stream } = mount(20, 5)
    stream.append(() => text("a\nb\nc"))
    await stream.render()

    expect(stream.fromScreen({ col: 2, row: 3 })).toEqual({ col: 2, row: 1 })
    expect(stream.fromScreen({ col: 2, row: 5 })).toEqual({ col: 2, row: 3 })
    expect(stream.fromScreen({ col: 2, row: 2 })).toBeUndefined()
    expect(stream.toScreen({ col: 4, row: 2 })).toEqual({ col: 4, row: 4 })
    expect(stream.toScreen({ col: 4, row: 4 })).toEqual({ col: 4, row: 6 })
  })

  test("maps overflowed stream rows to document rows", async () => {
    const { stream } = mount(20, 5)
    stream.append(() => text("a\nb\nc\nd\ne\nf"))
    await stream.render()

    expect(stream.fromScreen({ col: 1, row: 1 })).toEqual({ col: 1, row: 2 })
    expect(stream.fromScreen({ col: 1, row: 5 })).toEqual({ col: 1, row: 6 })
    expect(stream.toScreen({ col: 1, row: 1 })).toEqual({ col: 1, row: 0 })
    expect(stream.toScreen({ col: 1, row: 2 })).toEqual({ col: 1, row: 1 })
    expect(stream.toScreen({ col: 1, row: 6 })).toEqual({ col: 1, row: 5 })
  })

  test("returns stream rows by document row", async () => {
    const { stream } = mount(20, 5)
    stream.append(() => text("a\nb\nc\nd\ne\nf"))
    await stream.render()

    expect(stream.getRow(1)).toBe("a")
    expect(stream.getRow(2)).toBe("b")
    expect(stream.getRow(6)).toBe("f")
    expect(stream.getRow(0)).toBeUndefined()
    expect(stream.getRow(7)).toBeUndefined()
  })
})

describe("Stream.flush — first render", () => {
  test("writes rows at scrollBottom inside a synchronized-output block", async () => {
    const { stdout, stream } = mount(20, 10)
    stream.append(() => text("hello"))
    await stream.render()
    expect(stdout.all).toContain("\x1b[?2026h")
    expect(stdout.all).toContain("\x1b[?2026l")
    expect(stdout.all).toContain("\x1b[10;1H")
    expect(stdout.all).toContain("hello")
  })

  test("a state mutation schedules a flush automatically", async () => {
    const { stdout, stream } = mount(20, 10)
    stream.append(() => text("hello"))
    await drain()
    expect(stdout.all).toContain("hello")
  })
})

describe("Stream.flush — tail growth", () => {
  test("re-renders with absolute-cursor rewrites when state mutates", async () => {
    const { stdout, stream } = mount(20, 10)
    const t = text("one")
    stream.append(() => t)
    await stream.render()
    stdout.clear()

    t.state.content = "two"
    await stream.render()
    expect(stdout.all).toContain("two")
    expect(stdout.all).toMatch(/\u001B\[\d+;1H/)
  })

  test("growing the tail by one row emits the new row through the bottom", async () => {
    const { stdout, stream } = mount(10, 10)
    const t = text("one")
    stream.append(() => t)
    await stream.render()
    stdout.clear()

    t.state.content = "aaaaaaaa bbbbbbbb"
    await stream.render()
    expect(stdout.all).toContain("aaaaaaaa")
    expect(stdout.all).toContain("bbbbbbbb")
  })
})

describe("Stream.flush — tail overflowing the live region", () => {
  test("new rows are emitted through the bottom", async () => {
    const { stdout, stream } = mount(20, 5) // liveHeight = 5
    const t = text("a\nb\nc")
    stream.append(() => t)
    await stream.render()
    stdout.clear()

    t.state.content = "a\nb\nc\nd\ne\nf"
    await stream.render()
    expect(stdout.all).toContain("d")
    expect(stdout.all).toContain("e")
    expect(stdout.all).toContain("f")
  })
})

describe("Stream.append — dropping the previous tail", () => {
  test("appending a new tail paints the new row through the bottom", async () => {
    const { stdout, stream } = mount(20, 10)
    stream.append(() => text("one"))
    await stream.render()
    stdout.clear()

    stream.append(() => text("two"))
    await stream.render()
    expect(stdout.all).toContain("two")
  })

  test("two appends in the same tick both make it on screen", async () => {
    // The previous Stream design tracked only a single live tail via a
    // bottom-anchored mirror; appending a second node before the first
    // had flushed would overwrite the first's state and its content
    // would never be painted. The #live queue fixes that — every
    // appended node is rendered before it's dropped from the queue.
    const { stdout, stream } = mount(20, 10)
    stream.append(() => text("one"))
    stream.append(() => text("two"))
    await drain()
    expect(stdout.all).toContain("one")
    expect(stdout.all).toContain("two")
  })
})

describe("Stream.onStart / onStop", () => {
  test("onStart mounts every tracked node; onStop unmounts them", async () => {
    const { stream, renderer } = mount(20, 10)
    const t = text("x")
    stream.append(() => t)
    // Before the surface is "running", appends don't trigger mount.
    expect(t.mounted).toBe(false)
    await renderer.emit("start")
    expect(t.mounted).toBe(true)
    expect(t.surface).toBe("stream")
    await renderer.emit("stop")
    expect(t.mounted).toBe(false)
  })

  test("append while running mounts immediately", async () => {
    const { stream, renderer } = mount(20, 10)
    await renderer.emit("start")
    const t = text("x")
    stream.append(() => t)
    expect(t.mounted).toBe(true)
  })
})

describe("Stream — async rendering", () => {
  test("single append: initial value paints first, resolved value paints after invalidation", async () => {
    const { stdout, stream } = mount(40, 10)
    let resolveWork: (v: string) => void = () => {}
    const work = new Promise<string>((r) => {
      resolveWork = r
    })
    stream.append(() => {
      const body = createAsync(() => work, { initialValue: "INIT" })
      const formatted = memo(() => `>${body()}<`)
      return text(formatted, { wrap: "none" })
    })

    await stream.render()
    expect(stdout.all).toContain(">INIT<")
    expect(stdout.all).not.toContain(">DONE<")

    stdout.clear()
    resolveWork("DONE")
    await drain()

    expect(stdout.all).toContain(">DONE<")
  })

  test("two sequential appends update independently after async invalidation", async () => {
    const { stdout, stream } = mount(40, 10)

    let resolveA: (v: string) => void = () => {}
    const workA = new Promise<string>((r) => {
      resolveA = r
    })
    stream.append(() => {
      const body = createAsync(() => workA, { initialValue: "A:INIT" })
      const formatted = memo(() => `>${body()}<`)
      return text(formatted, { wrap: "none" })
    })

    await stream.render()
    expect(stdout.all).toContain(">A:INIT<")

    stdout.clear()
    resolveA("A:DONE")
    await drain()
    expect(stdout.all).toContain(">A:DONE<")

    stdout.clear()
    let resolveB: (v: string) => void = () => {}
    const workB = new Promise<string>((r) => {
      resolveB = r
    })
    stream.append(() => {
      const body = createAsync(() => workB, { initialValue: "B:INIT" })
      const formatted = memo(() => `>${body()}<`)
      return text(formatted, { wrap: "none" })
    })

    await stream.render()
    expect(stdout.all).toContain(">B:INIT<")

    stdout.clear()
    resolveB("B:DONE")
    await drain()
    expect(stdout.all).toContain(">B:DONE<")
  })
})
