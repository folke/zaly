import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Stream } from "../../src/renderer/stream.ts"
import { Terminal } from "../../src/renderer/terminal.ts"
import { text } from "../../src/widgets/text.ts"
import { MockReader, MockWriter } from "./mock.ts"

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
  return { stdout, stream, terminal }
}

// Drain enough microtasks that the scheduled render + flush chain
// completes. Four ticks covers schedule → flush() → await render() →
// write loop.
async function drain() {
  // Sequential awaits (not Promise.all) — each one drains one microtask
  // tick, which is exactly the point.
  // eslint-disable-next-line no-await-in-loop
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
    // eslint-disable-next-line no-control-regex -- matching ESC is the point.
    expect(stdout.all).toMatch(/\u001B\[\d+;1H/)
  })

  test("growing the tail by one row emits a single SU so existing rows ride the scroll", async () => {
    const { stdout, stream } = mount(10, 10)
    // Content that wraps to exactly 1 row at width=10.
    const t = text("one")
    stream.append(t)
    await stream.render()
    stdout.clear()

    // Force a two-row render by giving a long string that wraps at
    // cols=10. "aaaaaaaa bbbbbbbb" (17 cells) wraps to 2 rows. One SU
    // (size = insertCount = 1) shifts "one" up by a row; then the new
    // bottom row is painted at its bottom-anchored position.
    t.state.content = "aaaaaaaa bbbbbbbb"
    await stream.render()
    expect(stdout.all).toContain("\x1b[1S")
    expect(stdout.all).toContain("aaaaaaaa")
    expect(stdout.all).toContain("bbbbbbbb")
  })
})

describe("Stream.flush — tail overflowing the live region", () => {
  test("rows retained in the new extent aren't re-emitted", async () => {
    const { stdout, stream } = mount(20, 5) // liveHeight = 5
    const t = text("a\nb\nc")
    stream.append(t)
    await stream.render()
    stdout.clear()

    // Grow past the live region. rendered grew from 3 to 6 rows; the
    // insert phase emits a single batched SU(3) (batch size clamped to
    // liveHeight=5) and then paints the 3 new rows at the freed bottom
    // positions. "a" enters scrollback; "b" and "c" ride the scroll.
    t.state.content = "a\nb\nc\nd\ne\nf"
    await stream.render()
    expect(stdout.all).toContain("\x1b[3S")
    expect(stdout.all).toContain("d")
    expect(stdout.all).toContain("e")
    expect(stdout.all).toContain("f")
    // "b" and "c" rode the scroll — no re-emission.
    expect(stdout.all).not.toContain("b ")
    expect(stdout.all).not.toContain("c ")
  })
})

describe("Stream.append — dropping the previous tail", () => {
  test("new tail's first flush scrolls the old tail upward into scrollback", async () => {
    const { stdout, stream } = mount(20, 10)
    stream.append(text("one"))
    await stream.render()
    stdout.clear()

    // The previous tail painted one row; appending a new tail defers
    // an SU equal to that extent so the old row enters scrollback
    // before the new tail paints.
    stream.append(text("two"))
    await stream.render()
    expect(stdout.all).toContain("\x1b[1S")
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

describe("Stream.reset", () => {
  test("detaches the tail — subsequent mutations do not schedule a flush", async () => {
    const { stdout, stream } = mount(20, 10)
    const t = text("x")
    stream.append(t)
    await stream.render()
    stream.reset()
    stdout.clear()

    t.state.content = "y"
    await drain()
    expect(stdout.all).toBe("")
  })
})
