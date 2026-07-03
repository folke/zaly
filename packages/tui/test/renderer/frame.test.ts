import { createCtx } from "../../src/core/ctx.ts"
import { Frame } from "../../src/renderer/frame.ts"
import { Terminal } from "../../src/renderer/terminal.ts"
import { defaultTheme } from "../../src/themes/registry.ts"
import { describe, expect, test } from "vitest"
import { MockReader, MockWriter } from "./mock.ts"

function testFrame() {
  const terminal = new Terminal({ hookSignals: false, stdin: new MockReader(), stdout: new MockWriter(20, 5) })
  return {
    ctx: createCtx({ theme: { ...defaultTheme, selection: { inverse: true } }, width: 20 }),
    frame: new Frame(terminal).begin(),
  }
}

describe("RenderFrame.slice", () => {
  test("returns a full line plus the clamped selected range", () => {
    const { frame } = testFrame()
    frame.set(1, "hello")

    expect(frame.slice(1, -10, 4)).toEqual({ from: 1, line: "hello", to: 4 })
    expect(frame.slice(1, 5, 5)).toBeUndefined()
    expect(frame.slice(10, 1, 2)).toBeUndefined()
  })
})

describe("RenderFrame.highlight", () => {
  test("wraps a screen-column range in inverse video", () => {
    const { ctx, frame } = testFrame()
    frame.set(1, "hello world")
    expect(frame.highlight(1, 3, 7, ctx)).toEqual({ from: 3, line: "hello world", to: 7 })
    expect(frame.get(1)).toBe("he\x1b[7mllo \x1b[0mworld")
  })

  test("clamps ranges and ignores empty or offscreen highlights", () => {
    const { ctx, frame } = testFrame()
    frame.set(1, "hello")
    expect(frame.highlight(1, -10, 4, ctx)).toEqual({ from: 1, line: "hello", to: 4 })
    expect(frame.highlight(1, 5, 5, ctx)).toBeUndefined()
    expect(frame.highlight(10, 1, 2, ctx)).toBeUndefined()
    expect(frame.get(1)).toBe("\x1b[7mhel\x1b[0mlo")
  })

  test("preserves surrounding ANSI-styled content", () => {
    const { ctx, frame } = testFrame()
    frame.set(1, "a\x1b[31mbcd\x1b[0me")
    expect(frame.highlight(1, 2, 4, ctx)).toEqual({ from: 2, line: "a\x1b[31mbcd\x1b[0me", to: 4 })
    expect(frame.get(1)).toContain("\x1b[7m")
    expect(frame.get(1)).toContain("\x1b[0m")
    expect(frame.get(1)).toContain("\x1b[31m")
  })
})
