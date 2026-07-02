import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Frame } from "../../src/renderer/frame.ts"
import { SelectionLayer } from "../../src/renderer/selection.ts"
import { Terminal } from "../../src/renderer/terminal.ts"
import { defaultTheme } from "../../src/themes/registry.ts"
import { MockReader, MockWriter } from "./mock.ts"

const base = { alt: false, ctrl: false, meta: false, shift: false, type: "mouse" as const }

function testFrame() {
  const terminal = new Terminal({
    hookSignals: false,
    stdin: new MockReader(),
    stdout: new MockWriter(20, 5),
  })
  return {
    ctx: createCtx({ theme: { ...defaultTheme, selection: { inverse: true } }, width: 20 }),
    frame: new Frame(terminal).begin(),
  }
}

describe("SelectionLayer", () => {
  test("starts, updates, and finalizes a left-button drag selection", () => {
    const layer = new SelectionLayer({ invalidate: vi.fn() })

    expect(layer.mouse({ ...base, button: "left", kind: "down", x: 3, y: 4 })).toBe(true)
    expect(layer.selection).toEqual({
      anchor: { col: 3, row: 4, surface: "screen" },
      dragging: true,
      focus: { col: 3, row: 4, surface: "screen" },
    })

    expect(layer.mouse({ ...base, button: "left", kind: "drag", x: 8, y: 6 })).toBe(true)
    expect(layer.selection?.focus).toEqual({ col: 8, row: 6, surface: "screen" })

    expect(layer.mouse({ ...base, button: "left", kind: "up", x: 8, y: 6 })).toBe(true)
    expect(layer.selection).toMatchObject({ dragging: false, focus: { col: 8, row: 6 } })
  })

  test("clears click selections without a meaningful drag", () => {
    const layer = new SelectionLayer({ invalidate: vi.fn() })
    layer.mouse({ ...base, button: "left", kind: "down", x: 3, y: 4 })
    layer.mouse({ ...base, button: "left", kind: "up", x: 3, y: 4 })
    expect(layer.selection).toBeUndefined()
  })

  test("ignores non-left mouse buttons and scroll events", () => {
    const layer = new SelectionLayer({ invalidate: vi.fn() })
    expect(layer.mouse({ ...base, button: "right", kind: "down", x: 1, y: 1 })).toBe(false)
    expect(layer.mouse({ ...base, deltaY: 1, kind: "scroll", x: 1, y: 1 })).toBe(false)
    expect(layer.selection).toBeUndefined()
  })

  test("paints single-line screen selections", () => {
    const layer = new SelectionLayer({ invalidate: vi.fn() })
    const { ctx, frame } = testFrame()
    frame.set(3, "hello world")
    layer.mouse({ ...base, button: "left", kind: "down", x: 3, y: 3 })
    layer.mouse({ ...base, button: "left", kind: "drag", x: 8, y: 3 })

    layer.render(frame, ctx)

    expect(frame.get(3)).toBe("he\x1b[7mllo w\x1b[0morld")
  })

  test("paints multi-line screen selections", () => {
    const layer = new SelectionLayer({ invalidate: vi.fn() })
    const { ctx, frame } = testFrame()
    frame.set(2, "alpha")
    frame.set(3, "bravo")
    frame.set(4, "charlie")
    layer.mouse({ ...base, button: "left", kind: "down", x: 3, y: 2 })
    layer.mouse({ ...base, button: "left", kind: "drag", x: 4, y: 4 })

    layer.render(frame, ctx)

    expect(frame.get(2)).toBe("al\x1b[7mpha\x1b[0m")
    expect(frame.get(3)).toBe("\x1b[7mbravo\x1b[0m")
    expect(frame.get(4)).toBe("\x1b[7mcha\x1b[0mrlie")
  })

  test("clear removes selection and invalidates once", () => {
    const invalidate = vi.fn()
    const layer = new SelectionLayer({ invalidate })
    layer.mouse({ ...base, button: "left", kind: "down", x: 3, y: 4 })
    invalidate.mockClear()

    layer.clear()

    expect(layer.selection).toBeUndefined()
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})
