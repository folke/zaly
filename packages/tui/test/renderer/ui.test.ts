import { describe, expect, test } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { text } from "../../src/nodes/text.ts"
import { Terminal } from "../../src/renderer/terminal.ts"
import { UI } from "../../src/renderer/ui.ts"
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
  const ui = new UI(terminal, () => ctx)
  return { stdout, terminal, ui }
}

describe("UI.flush — first paint", () => {
  test("adding a child updates reserveBottom and paints at footerTop", async () => {
    const { stdout, terminal, ui } = mount(20, 10)
    ui.root.add(text("[input]"))
    await ui.flush()
    expect(terminal.reserveBottom).toBe(1)
    expect(terminal.scrollBottom).toBe(9)
    expect(terminal.footerTop).toBe(10)
    expect(stdout.all).toContain("\x1b[10;1H")
    expect(stdout.all).toContain("[input]")
  })
})

describe("UI.flush — row diff", () => {
  test("only rewrites rows whose content changed", async () => {
    const { stdout, ui } = mount(30, 10)
    const line = text("one")
    ui.root.add(line)
    await ui.flush()
    stdout.clear()

    line.state.content = "two"
    await ui.flush()
    expect(stdout.all).toContain("two")
    // eslint-disable-next-line no-control-regex -- matching ESC is the point.
    const moves = stdout.all.match(/\u001B\[\d+;1H/g) ?? []
    expect(moves.length).toBe(1)
  })
})

describe("UI — height changes", () => {
  test("growing the footer increases reserveBottom", async () => {
    const { terminal, ui } = mount(30, 10)
    ui.root.add(text("a"))
    await ui.flush()
    expect(terminal.reserveBottom).toBe(1)

    ui.root.add(text("b"))
    await ui.flush()
    expect(terminal.reserveBottom).toBe(2)
    expect(terminal.footerTop).toBe(9)
  })
})
