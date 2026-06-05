import { describe, expect, test } from "vitest"
import { inspectFormat, isMarkdown } from "../../src/style/inspect.ts"

describe("isMarkdown", () => {
  test("true for strings with MD markers and no ANSI", () => {
    expect(isMarkdown("**bold** text")).toBe(true)
    expect(isMarkdown("# heading")).toBe(true)
    expect(isMarkdown("a `code` span")).toBe(true)
  })

  test("false when no MD markers", () => {
    expect(isMarkdown("just some plain text")).toBe(false)
  })

  test("false when already ANSI-styled (avoid double-render)", () => {
    expect(isMarkdown("\x1b[31m**bold**\x1b[0m")).toBe(false)
  })
})

describe("inspect", () => {
  test("single string → returned as-is", () => {
    expect(inspectFormat(["hello"])).toBe("hello")
  })

  test("util.format-style %s strings are interpolated", () => {
    expect(inspectFormat(["hello %s", "world"])).toBe("hello world")
    expect(inspectFormat(["x=%d y=%d", 1, 2])).toBe("x=1 y=2")
  })

  test("Error values are reduced to .message when stacktrace is false", () => {
    const err = new Error("boom")
    expect(inspectFormat([err])).toBe("boom")
  })

  test("Error values include stack when stacktrace=true", () => {
    const err = new Error("boom")
    const out = inspectFormat([err], { stacktrace: true })
    expect(out).toContain("boom")
    expect(out).toContain("Error")
  })

  test("multi-arg mixed string + object", () => {
    const out = inspectFormat(["count:", { n: 1 }])
    expect(out).toContain("count:")
    expect(out).toContain("n:")
    expect(out).toContain("1")
  })

  test("two unrelated strings join with space", () => {
    expect(inspectFormat(["a", "b"])).toBe("a b")
  })

  test("objects get ANSI colors by default", () => {
    const out = inspectFormat([{ n: 1 }])
    expect(out).toMatch(/\x1b\[[0-9;]*m/)
    expect(out).toContain("n")
    expect(out).toContain("1")
  })

  test("colors can be disabled via opts.inspect.colors", () => {
    const out = inspectFormat([{ n: 1 }], { inspect: { colors: false } })
    expect(out).not.toMatch(/\x1b\[[0-9;]*m/)
    expect(out).toContain("n: 1")
  })

  test("mixed string + object still colorizes the object side", () => {
    const out = inspectFormat(["count:", { n: 1 }])
    expect(out).toMatch(/\x1b\[[0-9;]*m/)
    expect(out).toContain("count:")
  })
})
