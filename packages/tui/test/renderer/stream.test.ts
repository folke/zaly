import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { text } from "../../src/nodes/text.ts"
import { Stream } from "../../src/renderer/stream.ts"
import { Terminal } from "../../src/renderer/terminal.ts"
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
    await stream.flush()
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
    await stream.flush()
    stdout.clear()

    t.state.content = "two"
    await stream.flush()
    expect(stdout.all).toContain("two")
    // eslint-disable-next-line no-control-regex -- matching ESC is the point.
    expect(stdout.all).toMatch(/\u001B\[\d+;1H/)
  })

  test("growing the tail by one row scrolls once at scrollBottom to reserve space", async () => {
    const { stdout, stream } = mount(10, 10)
    // Content that wraps to exactly 1 row at width=10.
    const t = text("one")
    stream.append(t)
    await stream.flush()
    stdout.clear()

    // Force a two-row render by giving a long string that wraps at
    // cols=10. "aaaaaaaa bbbbbbbb" (17 cells) wraps to 2 rows.
    t.state.content = "aaaaaaaa bbbbbbbb"
    await stream.flush()
    // Expect exactly one bare "\n" — that's the single scroll we
    // needed to make room for the one extra row.
    const bareNewlines = (stdout.all.match(/(?<!K)\n/g) ?? []).length
    expect(bareNewlines).toBe(1)
  })
})

describe("Stream.append — dropping the previous tail", () => {
  test("new tail's first flush scrolls the old tail upward via newlines at scrollBottom", async () => {
    const { stdout, stream, terminal } = mount(20, 10)
    stream.append(text("one"))
    await stream.flush()
    stdout.clear()

    // Appending resets drawnHeight to 0. The new tail's first flush
    // emits `visible` newlines at `scrollBottom` to reserve space,
    // which scrolls the previous tail's visible rows upward.
    stream.append(text("two"))
    await stream.flush()
    expect(stdout.all).toContain(`\x1b[${terminal.scrollBottom};1H`)
    expect(stdout.all).toContain("\n")
    expect(stdout.all).toContain("two")
  })
})

describe("Stream.reset", () => {
  test("detaches the tail — subsequent mutations do not schedule a flush", async () => {
    const { stdout, stream } = mount(20, 10)
    const t = text("x")
    stream.append(t)
    await stream.flush()
    stream.reset()
    stdout.clear()

    t.state.content = "y"
    await drain()
    expect(stdout.all).toBe("")
  })
})
