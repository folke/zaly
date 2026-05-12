import { describe, expect, test } from "vitest"
import { Terminal } from "../../src/renderer/terminal.ts"
import { MockReader, MockWriter } from "./mock.ts"

function makeTerminal(cols = 80, rows = 24, reserveBottom = 0) {
  const stdout = new MockWriter(cols, rows)
  const stdin = new MockReader()
  const terminal = new Terminal({ hookSignals: false, reserveBottom, stdin, stdout })
  return { stdout, terminal }
}

describe("Terminal geometry", () => {
  test("reports cols/rows from stdout and computes scrollBottom from reserveBottom", () => {
    const { terminal } = makeTerminal(120, 40, 3)
    expect(terminal.cols).toBe(120)
    expect(terminal.rows).toBe(40)
    expect(terminal.scrollBottom).toBe(37) // 40 - 3
    expect(terminal.footerTop).toBe(38) // first footer row
  })

  test("scrollBottom floors at 1 when reserveBottom >= rows", () => {
    const { terminal } = makeTerminal(80, 5, 99)
    expect(terminal.scrollBottom).toBe(1)
  })
})

describe("Terminal.start / stop", () => {
  test("emits hide-cursor, DECAWM off, and DECSTBM when a footer is reserved", () => {
    const { stdout, terminal } = makeTerminal(80, 20, 3)
    terminal.start()
    // Hide cursor + DECAWM off.
    expect(stdout.all).toContain("\x1b[?25l")
    expect(stdout.all).toContain("\x1b[?7l")
    // DECSTBM bounds: [1, 17].
    expect(stdout.all).toContain("\x1b[1;17r")
    terminal.stop()
    // On stop: DECSTBM reset, DECAWM + cursor back on.
    expect(stdout.all).toContain("\x1b[r")
    expect(stdout.all).toContain("\x1b[?7h")
    expect(stdout.all).toContain("\x1b[?25h")
  })

  test("no DECSTBM emitted when reserveBottom is 0", () => {
    const { stdout, terminal } = makeTerminal(80, 20, 0)
    terminal.start()
    expect(stdout.all).not.toMatch(/\u001B\[\d+;\d+r/)
    terminal.stop()
  })

  test("setReserveBottom re-issues DECSTBM after start", () => {
    const { stdout, terminal } = makeTerminal(80, 20, 0)
    terminal.start()
    stdout.clear()
    terminal.setReserveBottom(4)
    expect(stdout.all).toContain("\x1b[1;16r")
    expect(terminal.scrollBottom).toBe(16)
  })
})

describe("Terminal.sync", () => {
  test("wraps a block of writes with ?2026h / ?2026l", () => {
    const { stdout, terminal } = makeTerminal()
    terminal.start()
    stdout.clear()
    terminal.sync(() => terminal.write("hello"))
    expect(stdout.all).toBe(`\x1b[?2026hhello\x1b[?2026l`)
  })

  test("still emits the terminator if the callback throws", () => {
    const { stdout, terminal } = makeTerminal()
    terminal.start()
    expect(() =>
      terminal.sync(() => {
        terminal.write("x")
        throw new Error("boom")
      })
    ).toThrow("boom")
    expect(stdout.all.endsWith("\x1b[?2026l")).toBe(true)
  })
})
