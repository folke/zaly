import { describe, expect, test } from "vitest"
import { Renderer } from "../../src/renderer/renderer.ts"
import { text } from "../../src/widgets/text.ts"
import { MockReader, MockWriter } from "./mock.ts"

function mount(cols = 20, rows = 10) {
  const stdout = new MockWriter(cols, rows)
  const renderer = new Renderer({ hookSignals: false, stdin: new MockReader(), stdout })
  const { terminal, ui } = renderer
  terminal.start()
  stdout.clear()
  return { stdout, terminal, ui }
}

describe("UI.flush — first paint", () => {
  test("adding a child updates reserveBottom and paints at footerTop", async () => {
    const { stdout, terminal, ui } = mount(20, 10)
    ui.root.add(text("[input]"))
    await ui.render()
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
    await ui.render()
    stdout.clear()

    line.state.content = "two"
    await ui.render()
    expect(stdout.all).toContain("two")
    const moves = stdout.all.match(/\u001B\[\d+;1H/g) ?? []
    expect(moves.length).toBe(1)
  })
})

describe("UI — height changes", () => {
  test("growing the footer increases reserveBottom", async () => {
    const { terminal, ui } = mount(30, 10)
    ui.root.add(text("a"))
    await ui.render()
    expect(terminal.reserveBottom).toBe(1)

    ui.root.add(text("b"))
    await ui.render()
    expect(terminal.reserveBottom).toBe(2)
    expect(terminal.footerTop).toBe(9)
  })
})
