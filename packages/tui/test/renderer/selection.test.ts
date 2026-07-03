import type { Renderer } from "../../src/renderer/renderer.ts"
import type { Point } from "../../src/renderer/surface.ts"

import { describe, expect, test, vi } from "vitest"
import { createCtx } from "../../src/core/ctx.ts"
import { Frame } from "../../src/renderer/frame.ts"
import { SelectionLayer } from "../../src/renderer/selection.ts"
import { Terminal } from "../../src/renderer/terminal.ts"
import { defaultTheme } from "../../src/themes/registry.ts"
import { MockReader, MockWriter } from "./mock.ts"

const base = { alt: false, ctrl: false, meta: false, shift: false, type: "mouse" as const }

type TestRendererOpts = {
  overlay?: boolean
  stream?: boolean
  streamBounds?: { top: number; bottom: number }
  streamFromScreen?: (point: Point) => Point | undefined
  streamGetRow?: (row: number) => string | undefined
  streamToScreen?: (point: Point) => Point
  ui?: boolean
}

function testRenderer(opts: TestRendererOpts = {}): Renderer & { $emit: ReturnType<typeof vi.fn> } {
  const emit = vi.fn()
  return {
    $emit: emit,
    emit,
    overlay: {
      contains: vi.fn(() => opts.overlay ?? false),
      invalidate: vi.fn(),
    },
    stream: {
      bounds: opts.streamBounds ?? { bottom: 5, top: 1 },
      contains: vi.fn(() => opts.stream ?? false),
      fromScreen: vi.fn(opts.streamFromScreen ?? ((point) => point)),
      getRow: vi.fn(opts.streamGetRow ?? (() => undefined)),
      toScreen: vi.fn(opts.streamToScreen ?? ((point) => point)),
    },
    ui: {
      contains: vi.fn(() => opts.ui ?? false),
    },
  } as unknown as Renderer & { $emit: typeof emit }
}

function layer(opts?: TestRendererOpts) {
  return new SelectionLayer(testRenderer(opts))
}

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
    const s = layer()

    expect(s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 4 })).toBe(true)
    expect(s.selection).toEqual({
      dragging: true,
      from: { col: 3, row: 4 },
      surface: "screen",
      to: { col: 3, row: 4 },
    })

    expect(s.mouse({ ...base, button: "left", kind: "drag", x: 8, y: 6 })).toBe(true)
    expect(s.selection?.to).toEqual({ col: 8, row: 6 })

    expect(s.mouse({ ...base, button: "left", kind: "up", x: 8, y: 6 })).toBe(true)
    expect(s.selection).toMatchObject({ dragging: false, to: { col: 8, row: 6 } })
  })

  test("clears click selections without a meaningful drag", () => {
    const s = layer()
    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 4 })
    s.mouse({ ...base, button: "left", kind: "up", x: 3, y: 4 })
    expect(s.selection).toBeUndefined()
  })

  test("ignores non-left mouse buttons and scroll events", () => {
    const s = layer()
    expect(s.mouse({ ...base, button: "right", kind: "down", x: 1, y: 1 })).toBe(false)
    expect(s.mouse({ ...base, deltaY: 1, kind: "scroll", x: 1, y: 1 })).toBe(false)
    expect(s.selection).toBeUndefined()
  })

  test("paints single-line screen selections", () => {
    const s = layer()
    const { ctx, frame } = testFrame()
    frame.set(3, "hello world")
    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 3 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 8, y: 3 })

    s.render(frame, ctx)

    expect(frame.get(3)).toBe("he\x1b[7mllo w\x1b[0morld")
  })

  test("paints multi-line screen selections", () => {
    const s = layer()
    const { ctx, frame } = testFrame()
    frame.set(2, "alpha")
    frame.set(3, "bravo")
    frame.set(4, "charlie")
    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 2 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 4, y: 4 })

    s.render(frame, ctx)

    expect(frame.get(2)).toBe("al\x1b[7mpha\x1b[0m")
    expect(frame.get(3)).toBe("\x1b[7mbravo\x1b[0m")
    expect(frame.get(4)).toBe("\x1b[7mcha\x1b[0mrlie")
  })

  test("stores normalized text for highlighted screen selections", () => {
    const s = layer()
    const { ctx, frame } = testFrame()
    frame.set(1, "  \x1b[31mfoo\x1b[0m  ")
    frame.set(2, "  bar  ")
    frame.set(3, "  ")
    frame.set(4, "  baz  ")
    s.mouse({ ...base, button: "left", kind: "down", x: 1, y: 1 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 7, y: 4 })

    s.render(frame, ctx)

    expect(s.text).toBe("foo\nbar\n\nbaz")
  })

  test("uses full rows for common indent detection", () => {
    const s = layer()
    const { ctx, frame } = testFrame()
    frame.set(1, "  cd packages/tui  ")
    frame.set(2, "  98 pass  ")
    frame.set(3, "  0 fail  ")
    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 1 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 9, y: 3 })

    s.render(frame, ctx)

    expect(s.text).toBe("cd packages/tui\n98 pass\n0 fail")
  })

  test("stores normalized text for clipped stream selections", () => {
    const s = layer({
      stream: true,
      streamBounds: { bottom: 3, top: 2 },
      streamFromScreen: (point) => ({ col: point.col, row: point.row + 100 }),
      streamGetRow: (row) => {
        if (row === 101) return "above"
        if (row === 102) return "  \x1b[31mfoo\x1b[0m  "
        if (row === 103) return "  bar  "
        if (row === 104) return "below"
      },
      streamToScreen: (point) => ({ col: point.col, row: point.row - 100 }),
    })
    const { ctx, frame } = testFrame()
    frame.set(1, "above")
    frame.set(2, "  \x1b[31mfoo\x1b[0m  ")
    frame.set(3, "  bar  ")
    frame.set(4, "below")
    s.mouse({ ...base, button: "left", kind: "down", x: 1, y: 1 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 20, y: 4 })

    s.render(frame, ctx)

    expect(s.text).toBe("foo\nbar")
  })

  test("stream selection text ignores overlaid screen contents", () => {
    const s = layer({
      stream: true,
      streamBounds: { bottom: 2, top: 1 },
      streamFromScreen: (point) => ({ col: point.col, row: point.row + 100 }),
      streamGetRow: (row) => {
        if (row === 101) return "  stream one  "
        if (row === 102) return "  stream two  "
      },
      streamToScreen: (point) => ({ col: point.col, row: point.row - 100 }),
    })
    const { ctx, frame } = testFrame()
    frame.set(1, "  overlay one  ")
    frame.set(2, "  overlay two  ")
    s.mouse({ ...base, button: "left", kind: "down", x: 1, y: 1 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 20, y: 2 })

    s.render(frame, ctx)

    expect(s.text).toBe("stream one\nstream two")
  })

  test("clear removes selection text", () => {
    const s = layer()
    const { ctx, frame } = testFrame()
    frame.set(1, "hello")
    s.mouse({ ...base, button: "left", kind: "down", x: 1, y: 1 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 6, y: 1 })
    s.render(frame, ctx)
    expect(s.text).toBe("hello")

    s.clear()

    expect(s.text).toBe("")
  })

  test("clear removes selection and invalidates once", () => {
    const renderer = testRenderer()
    const s = new SelectionLayer(renderer)
    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 4 })
    renderer.$emit.mockClear()

    s.clear()

    expect(s.selection).toBeUndefined()
    expect(renderer.$emit).toHaveBeenCalledWith("dirty")
  })

  test("uses stream anchoring only when both endpoints are in stream", () => {
    const overlay = layer({ overlay: true, stream: true, ui: true })
    overlay.mouse({ ...base, button: "left", kind: "down", x: 2, y: 3 })
    expect(overlay.selection).toMatchObject({ from: { col: 2, row: 3 }, surface: "screen" })

    const ui = layer({ stream: true, ui: true })
    ui.mouse({ ...base, button: "left", kind: "down", x: 2, y: 3 })
    expect(ui.selection).toMatchObject({ from: { col: 2, row: 3 }, surface: "screen" })

    const stream = layer({
      stream: true,
      streamFromScreen: (point) =>
        point.row <= 5 ? { col: point.col, row: point.row + 100 } : undefined,
    })
    stream.mouse({ ...base, button: "left", kind: "down", x: 2, y: 3 })
    expect(stream.selection).toMatchObject({ from: { col: 2, row: 103 }, surface: "stream" })

    stream.mouse({ ...base, button: "left", kind: "drag", x: 2, y: 4 })
    expect(stream.selection).toMatchObject({ surface: "stream", to: { col: 2, row: 104 } })

    stream.mouse({ ...base, button: "left", kind: "drag", x: 2, y: 9 })
    expect(stream.selection).toMatchObject({ surface: "screen", to: { col: 2, row: 9 } })
  })

  test("renders stream selections through current screen coordinates", () => {
    const s = layer({
      stream: true,
      streamFromScreen: (point) => ({ col: point.col, row: point.row + 100 }),
      streamToScreen: (point) => ({ col: point.col, row: point.row - 100 }),
    })
    const { ctx, frame } = testFrame()
    frame.set(3, "hello world")

    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 3 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 8, y: 3 })
    s.render(frame, ctx)

    expect(frame.get(3)).toBe("he\x1b[7mllo w\x1b[0morld")
  })

  test("clips stream selections to stream bounds", () => {
    const s = layer({
      stream: true,
      streamBounds: { bottom: 4, top: 2 },
      streamFromScreen: (point) => ({ col: point.col, row: point.row + 100 }),
      streamToScreen: (point) => ({ col: point.col, row: point.row - 100 }),
    })
    const { ctx, frame } = testFrame()
    frame.set(1, "above")
    frame.set(2, "alpha")
    frame.set(3, "bravo")
    frame.set(4, "charlie")
    frame.set(5, "below")

    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 1 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 4, y: 5 })
    s.render(frame, ctx)

    expect(frame.get(1)).toBe("above")
    expect(frame.get(2)).toBe("\x1b[7malpha\x1b[0m")
    expect(frame.get(3)).toBe("\x1b[7mbravo\x1b[0m")
    expect(frame.get(4)).toBe("\x1b[7mcharlie\x1b[0m")
    expect(frame.get(5)).toBe("below")
  })

  test("screen-started selection into stream remains screen anchored", () => {
    const s = layer({
      stream: true,
      streamFromScreen: (point) => (point.row >= 3 ? { col: point.col, row: point.row + 100 } : undefined),
    })

    s.mouse({ ...base, button: "left", kind: "down", x: 2, y: 1 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 2, y: 3 })

    expect(s.selection).toMatchObject({ surface: "screen", to: { col: 2, row: 3 } })
  })

  test("mouse up emits a changed finalized selection", () => {
    const s = layer()
    const changes: unknown[] = []
    s.on("change", (event) => changes.push(event))

    s.mouse({ ...base, button: "left", kind: "down", x: 3, y: 4 })
    s.mouse({ ...base, button: "left", kind: "drag", x: 8, y: 6 })
    s.mouse({ ...base, button: "left", kind: "up", x: 8, y: 6 })

    expect(changes.at(-1)).toMatchObject({
      prev: { dragging: true },
      selection: { dragging: false },
    })
  })
})
