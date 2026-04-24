import { describe, expect, test } from "vitest"
import { parseJson } from "../../src/json/parse.ts"

describe("parseJson — happy path", () => {
  test("parses standard JSON without repair", () => {
    const result = parseJson('{"city":"Tokyo"}')
    expect(result).toEqual({ data: { city: "Tokyo" }, repaired: false, success: true })
  })

  test("handles arrays", () => {
    const result = parseJson("[1,2,3]")
    expect(result).toEqual({ data: [1, 2, 3], repaired: false, success: true })
  })

  test("handles nested structures", () => {
    const result = parseJson('{"a":{"b":[1,{"c":true}]}}')
    if (!result.success) throw new Error("expected success")
    expect(result.data).toEqual({ a: { b: [1, { c: true }] } })
    expect(result.repaired).toBe(false)
  })

  test("surrounding whitespace is trimmed", () => {
    const result = parseJson('  \n  {"x": 1}  \n  ')
    expect(result).toMatchObject({ data: { x: 1 }, success: true })
  })
})

describe("parseJson — envelope stripping", () => {
  test("strips ```json fence (via jsonrepair)", () => {
    const result = parseJson('```json\n{"city":"Tokyo"}\n```')
    expect(result).toMatchObject({ data: { city: "Tokyo" }, repaired: true, success: true })
  })

  test("strips plain ``` fence (via jsonrepair)", () => {
    const result = parseJson('```\n{"x":1}\n```')
    expect(result).toMatchObject({ data: { x: 1 }, repaired: true, success: true })
  })

  test("strips prose prefix before first {", () => {
    const result = parseJson('Here is the JSON you requested: {"city":"Tokyo"}')
    expect(result).toMatchObject({ data: { city: "Tokyo" }, success: true })
  })

  test("strips prose prefix before first [", () => {
    const result = parseJson("Sure! [1, 2, 3]")
    expect(result).toMatchObject({ data: [1, 2, 3], success: true })
  })

  test("leaves already-clean JSON alone (no false-positive prose)", () => {
    const result = parseJson('{"prose": "Here is some text"}')
    expect(result).toMatchObject({ data: { prose: "Here is some text" }, success: true })
  })
})

describe("parseJson — repair via jsonrepair", () => {
  test("trailing comma", () => {
    const result = parseJson('{"a": 1, "b": 2,}')
    expect(result).toMatchObject({ data: { a: 1, b: 2 }, repaired: true, success: true })
  })

  test("missing comma between fields", () => {
    const result = parseJson('{"a": 1 "b": 2}')
    expect(result).toMatchObject({ data: { a: 1, b: 2 }, repaired: true, success: true })
  })

  test("unquoted keys", () => {
    const result = parseJson("{city: 'Tokyo'}")
    expect(result).toMatchObject({ data: { city: "Tokyo" }, repaired: true, success: true })
  })

  test("single quotes", () => {
    const result = parseJson("{'city': 'Tokyo'}")
    expect(result).toMatchObject({ data: { city: "Tokyo" }, repaired: true, success: true })
  })

  test("Python-style booleans", () => {
    const result = parseJson('{"a": True, "b": False}')
    expect(result).toMatchObject({
      data: { a: true, b: false },
      repaired: true,
      success: true,
    })
  })

  test("smart quotes", () => {
    const result = parseJson("{\u201ccity\u201d: \u201cTokyo\u201d}")
    expect(result).toMatchObject({ data: { city: "Tokyo" }, repaired: true, success: true })
  })

  test("truncated object closes automatically", () => {
    const result = parseJson('{"city": "Tokyo"')
    expect(result).toMatchObject({ data: { city: "Tokyo" }, repaired: true, success: true })
  })

  test("truncated string closes automatically", () => {
    const result = parseJson('{"city": "Tok')
    expect(result).toMatchObject({ repaired: true, success: true })
    if (!result.success) throw new Error("expected success")
    expect((result.data as { city: string }).city).toBe("Tok")
  })

  test("JS-style comments stripped", () => {
    const result = parseJson('{/* a comment */"city": "Tokyo" // trailing\n}')
    expect(result).toMatchObject({ data: { city: "Tokyo" }, repaired: true, success: true })
  })

  test("markdown fence + trailing comma (combined fixes)", () => {
    const result = parseJson('```json\n{"a":1,}\n```')
    expect(result).toMatchObject({ data: { a: 1 }, repaired: true, success: true })
  })
})

describe("parseJson — unsalvageable input", () => {
  test("empty string", () => {
    const result = parseJson("")
    expect(result).toEqual({ error: "empty input", success: false })
  })

  test("only whitespace", () => {
    const result = parseJson("   \n  \t ")
    expect(result).toEqual({ error: "empty input", success: false })
  })

  test("pure prose is salvaged as a string literal", () => {
    // jsonrepair interprets arbitrary text as a string value. Not
    // "unsalvageable" in the parse sense; downstream validation
    // against an object-shaped schema will reject it.
    const result = parseJson("this is not json at all")
    expect(result).toMatchObject({
      data: "this is not json at all",
      repaired: true,
      success: true,
    })
  })
})
