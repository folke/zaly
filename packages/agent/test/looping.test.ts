import { describe, expect, test } from "vitest"
import { createLoopDetector } from "../../src/utils/looping.ts"
import type { ToolCallPart } from "../../src/types.ts"

function call(name: string, params: unknown, id = `c-${Math.random()}`): ToolCallPart {
  return { id, name, params, type: "tool-call" }
}

describe("createLoopDetector — consecutive repeats", () => {
  test("trips after N consecutive identical calls", () => {
    const detect = createLoopDetector({ consecutive: 3 })
    const a1 = call("read", { path: "/a" })
    const a2 = call("read", { path: "/a" })
    const a3 = call("read", { path: "/a" })
    expect(detect([a1])).toBe(false)
    expect(detect([a1, a2])).toBe(false)
    expect(detect([a1, a2, a3])).toBe(true)
  })

  test("does not trip when the same call is broken up", () => {
    const detect = createLoopDetector({ consecutive: 3 })
    const a = call("read", { path: "/a" })
    const b = call("read", { path: "/b" })
    expect(detect([a, b, a, b, a])).toBe(false)
  })

  test("default consecutive is 3", () => {
    const detect = createLoopDetector()
    const c = call("x", {})
    expect(detect([c, c])).toBe(false)
    expect(detect([c, c, c])).toBe(true)
  })
})

describe("createLoopDetector — windowed duplicates", () => {
  test("trips when a single call appears too many times in the window", () => {
    const detect = createLoopDetector({ consecutive: 99, window: 10, windowRepeats: 4 })
    const a = call("read", { path: "/a" })
    const b = call("read", { path: "/b" })
    expect(detect([a, b, a, b, a, b])).toBe(false)
    expect(detect([a, b, a, b, a, b, a])).toBe(true)
  })

  test("only counts within the window, not full history", () => {
    const detect = createLoopDetector({ consecutive: 99, window: 4, windowRepeats: 3 })
    const a = call("read", { path: "/a" })
    const filler = Array.from({ length: 5 }, (_, i) => call("other", { i }))
    expect(detect([a, a, a, ...filler])).toBe(false)
  })
})

describe("createLoopDetector — equality", () => {
  test("differing params do not match", () => {
    const detect = createLoopDetector({ consecutive: 2 })
    const a = call("read", { path: "/a" })
    const b = call("read", { path: "/b" })
    expect(detect([a, b])).toBe(false)
  })

  test("differing names do not match", () => {
    const detect = createLoopDetector({ consecutive: 2 })
    const a = call("read", { path: "/a" })
    const b = call("write", { path: "/a" })
    expect(detect([a, b])).toBe(false)
  })
})
