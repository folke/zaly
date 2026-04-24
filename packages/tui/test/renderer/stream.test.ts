import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Stream } from "../../src/renderer/stream.ts"
import { Terminal } from "../../src/renderer/terminal.ts"
import { text } from "../../src/widgets/text.ts"
import { MockReader, MockWriter, mockMountCtx } from "./mock.ts"

function mount(cols = 20, rows = 10) {
  const stdout = new MockWriter(cols, rows)
  const terminal = new Terminal({
    hookSignals: false,
    reserveBottom: 0,
    stdin: new MockReader(),
    stdout,
  })
  terminal.start()
  stdout.clear()
  const ctx = createCtx({ width: terminal.cols })
  const stream = new Stream(terminal, () => ctx)
  // Tests exercise Stream in isolation (no Renderer present). Self-
  // schedule on `"dirty"` so `stream.add(...)` still eventually renders
  // when awaiting microtasks, mirroring the Renderer's behaviour.
  let scheduled = false
  stream.on("dirty", () => {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      void stream.render()
    })
  })
  return { stdout, stream, terminal }
}

// Drain enough microtasks that the scheduled render + flush chain
// completes. Four ticks covers schedule → flush() → await render() →
// write loop.
async function drain() {
  // Sequential awaits (not Promise.all) — each one drains one microtask
  // tick, which is exactly the point.
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe("Stream.flush — first render", () => {
  test("writes rows at scrollBottom inside a synchronized-output block", async () => {
    const { stdout, stream } = mount(20, 10)
    stream.append(text("hello"))
    await stream.render()
    expect(stdout.all).toContain("\x1b[?2026h")
    expect(stdout.all).toContain("\x1b[?2026l")
    expect(stdout.all).toContain("\x1b[10;1H")
    expect(stdout.all).toContain("hello")
  })

  test("a state mutation schedules a flush automatically", async () => {
    const { stdout, stream } = mount(20, 10)
    stream.append(text("hello"))
    await drain()
    expect(stdout.all).toContain("hello")
  })
})

describe("Stream.flush — tail growth", () => {
  test("re-renders with absolute-cursor rewrites when state mutates", async () => {
    const { stdout, stream } = mount(20, 10)
    const t = text("one")
    stream.append(t)
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
    stream.append(t)
    await stream.render()
    stdout.clear()

    t.state.content = "aaaaaaaa bbbbbbbb"
    await stream.render()
    expect(stdout.all).toContain("\n")
    expect(stdout.all).toContain("aaaaaaaa")
    expect(stdout.all).toContain("bbbbbbbb")
  })
})

describe("Stream.flush — tail overflowing the live region", () => {
  test("new rows are emitted through the bottom", async () => {
    const { stdout, stream } = mount(20, 5) // liveHeight = 5
    const t = text("a\nb\nc")
    stream.append(t)
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
    stream.append(text("one"))
    await stream.render()
    stdout.clear()

    stream.append(text("two"))
    await stream.render()
    expect(stdout.all).toContain("\n")
    expect(stdout.all).toContain("two")
  })

  test("two appends in the same tick both make it on screen", async () => {
    // The previous Stream design tracked only a single live tail via a
    // bottom-anchored mirror; appending a second node before the first
    // had flushed would overwrite the first's state and its content
    // would never be painted. The #live queue fixes that — every
    // appended node is rendered before it's dropped from the queue.
    const { stdout, stream } = mount(20, 10)
    stream.append(text("one"))
    stream.append(text("two"))
    await drain()
    expect(stdout.all).toContain("one")
    expect(stdout.all).toContain("two")
  })
})

describe("Stream.onStart / onStop", () => {
  test("onStart mounts every tracked node; onStop unmounts them", async () => {
    const { stream } = mount(20, 10)
    const t = text("x")
    stream.append(t)
    // Before the surface is "running", appends don't trigger mount.
    expect(t.mounted).toBe(false)
    stream.onStart(mockMountCtx("stream"))
    expect(t.mounted).toBe(true)
    expect(t.surface).toBe("stream")
    stream.onStop()
    expect(t.mounted).toBe(false)
  })

  test("append while running mounts immediately", () => {
    const { stream } = mount(20, 10)
    stream.onStart(mockMountCtx("stream"))
    const t = text("x")
    stream.append(t)
    expect(t.mounted).toBe(true)
  })
})
