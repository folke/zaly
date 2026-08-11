import { describe, expect, test } from "vitest"
import { Terminal } from "../../src/renderer/terminal.ts"
import { autoStop, MockReader, MockWriter } from "./mock.ts"

const track = autoStop()

function makeTerminal(cols = 80, rows = 24, reserveBottom = 0) {
  const stdout = new MockWriter(cols, rows)
  const stdin = new MockReader()
  const terminal = track(new Terminal({ hookSignals: false, reserveBottom, stdin, stdout }))
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
    expect(stdout.all).toContain("\x1b[>7u\x1b[?u\x1b[>c")
    // DECSTBM bounds: [1, 17].
    expect(stdout.all).toContain("\x1b[1;17r")
    terminal.stop()
    // On stop: DECSTBM reset, DECAWM + cursor back on.
    expect(stdout.all).toContain("\x1b[r")
    expect(stdout.all).toContain("\x1b[<u")
    expect(stdout.all).toContain("\x1b[?7h")
    expect(stdout.all).toContain("\x1b[?25h")
  })

  test("enables Kitty keyboard reporting after a positive response", () => {
    const { stdout, terminal } = makeTerminal()
    terminal.start()
    expect(
      terminal.handleKeyboardProtocolResponse({
        final: "u",
        kind: "csi",
        params: "?7",
        sequence: "\x1b[?7u",
        type: "term-response",
      })
    ).toBe(true)
    expect(terminal.kittyKeyboard).toBe(true)
    expect(terminal.modifyOtherKeys).toBe(false)
    terminal.stop()
    expect(stdout.all).toContain("\x1b[<u")
  })

  test("falls back to xterm modifyOtherKeys when Kitty is unavailable", () => {
    const { stdout, terminal } = makeTerminal()
    terminal.start()
    expect(
      terminal.handleKeyboardProtocolResponse({
        final: "c",
        kind: "csi",
        params: ">41;348;0",
        sequence: "\x1b[>41;348;0c",
        type: "term-response",
      })
    ).toBe(true)
    expect(terminal.kittyKeyboard).toBe(false)
    expect(terminal.modifyOtherKeys).toBe(true)
    expect(stdout.all).toContain("\x1b[>4;2m")
    terminal.stop()
    expect(stdout.all).toContain("\x1b[>4;0m")
  })

  test("leaves primary Device Attributes replies for the image-detection queries", () => {
    // Primary DA (`CSI ? … c`) is the image-detection fence; the keyboard
    // handler must not consume it or enable a fallback from it.
    const { terminal } = makeTerminal()
    terminal.start()
    expect(
      terminal.handleKeyboardProtocolResponse({
        final: "c",
        kind: "csi",
        params: "?62;4;52",
        sequence: "\x1b[?62;4;52c",
        type: "term-response",
      })
    ).toBe(false)
    expect(terminal.modifyOtherKeys).toBe(false)
    terminal.stop()
  })

  test("switches from the fallback when a delayed Kitty response arrives", () => {
    const { stdout, terminal } = makeTerminal()
    terminal.start()
    terminal.handleKeyboardProtocolResponse({
      final: "c",
      kind: "csi",
      params: ">41;348;0",
      sequence: "\x1b[>41;348;0c",
      type: "term-response",
    })
    expect(terminal.modifyOtherKeys).toBe(true)

    terminal.handleKeyboardProtocolResponse({
      final: "u",
      kind: "csi",
      params: "?7",
      sequence: "\x1b[?7u",
      type: "term-response",
    })
    expect(terminal.kittyKeyboard).toBe(true)
    expect(terminal.modifyOtherKeys).toBe(false)
    expect(stdout.all).toContain("\x1b[>4;0m")
    terminal.stop()
  })

  test("ignores malformed keyboard protocol responses", () => {
    const { terminal } = makeTerminal()
    terminal.start()
    expect(
      terminal.handleKeyboardProtocolResponse({
        final: "u",
        kind: "csi",
        params: "?7;1",
        sequence: "\x1b[?7;1u",
        type: "term-response",
      })
    ).toBe(false)
    expect(terminal.kittyKeyboard).toBe(false)
    expect(terminal.modifyOtherKeys).toBe(false)
    terminal.stop()
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
