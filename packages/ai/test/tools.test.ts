import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { defineTool, runTool, ToolError, stringifyToolResult } from "../src/tools.ts"

const Adder = defineTool({
  desc: "add two numbers",
  call: ({ a, b }) => a + b,
  name: "add",
  params: Type.Object({ a: Type.Number(), b: Type.Number() }),
})

describe("defineTool", () => {
  test("builds a Tool with input schema + validators", () => {
    expect(Adder.name).toBe("add")
    expect(Adder.desc).toBe("add two numbers")
    expect(typeof Adder.validateParams).toBe("function")
    expect(typeof Adder.call).toBe("function")
  })

  test("validateInput coerces stringified primitives", () => {
    const input = Adder.validateParams({ a: "3", b: "4" })
    expect(input).toEqual({ a: 3, b: 4 })
  })

  test("validateInput strips unknown properties", () => {
    const input = Adder.validateParams({ a: 1, b: 2, junk: "x" })
    expect(input).toEqual({ a: 1, b: 2 })
  })

  test("validateInput throws with annotated message on bad input", () => {
    try {
      Adder.validateParams({ a: "notanumber" })
      throw new Error("expected throw")
    } catch (error) {
      expect((error as Error).message).toMatch(/❌/)
      expect((error as Error).message).toContain("b")
    }
  })
})

describe("runTool — happy path", () => {
  test("returns output with isError=false", async () => {
    const r = await runTool(Adder, { a: 2, b: 3 })
    expect(r).toEqual({ isError: false, result: 5 })
  })

  test("accepts a JSON string for args", async () => {
    const r = await runTool(Adder, '{"a": 2, "b": 3}')
    expect(r).toEqual({ isError: false, result: 5 })
  })

  test("applies coercion through runTool", async () => {
    const r = await runTool(Adder, { a: "10", b: "20" })
    expect(r).toEqual({ isError: false, result: 30 })
  })
})

describe("runTool — validation failures", () => {
  test("returns annotated error on invalid args", async () => {
    const r = await runTool(Adder, { a: "notanumber" })
    expect(r.isError).toBe(true)
    expect(String(r.result)).toMatch(/❌/)
  })

  test("returns parse error on unsalvageable JSON string", async () => {
    const r = await runTool(Adder, "")
    expect(r.isError).toBe(true)
  })
})

describe("runTool — tool errors", () => {
  const Failing = defineTool({
    call: () => {
      throw new ToolError({
        code: "NOT_FOUND",
        data: { id: "42" },
        message: "record not found",
      })
    },
    params: Type.Object({ id: Type.String() }),
    name: "fail",
  })

  test("surfaces ToolError code + message", async () => {
    const r = await runTool(Failing, { id: "42" })
    expect(r.isError).toBe(true)
    const msg = String(r.result)
    expect(msg).toContain("NOT_FOUND")
    expect(msg).toContain("record not found")
  })

  test("wraps unknown throws as internal errors", async () => {
    const Throws = defineTool({
      call: () => {
        throw new Error("boom")
      },
      params: Type.Object({}),
      name: "throws",
    })
    const r = await runTool(Throws, {})
    expect(r.isError).toBe(true)
    expect(String(r.result)).toContain("boom")
  })
})

describe("runTool — output validation", () => {
  const Echo = defineTool({
    call: (_x: { n: number }) => ({ wrong: "shape" }) as unknown as { n: number },
    params: Type.Object({ n: Type.Number() }),
    name: "echo",
    result: Type.Object({ n: Type.Number() }),
  })

  test("catches output that violates the output schema", async () => {
    const r = await runTool(Echo, { n: 1 })
    expect(r.isError).toBe(true)
    expect(String(r.result)).toMatch(/output|internal/i)
  })
})

describe("stringifyToolResult", () => {
  test("strings pass through verbatim", () => {
    expect(stringifyToolResult("hello")).toBe("hello")
    expect(stringifyToolResult("")).toBe("")
  })

  test("objects and arrays get JSON-encoded", () => {
    expect(stringifyToolResult({ a: 1 })).toBe('{"a":1}')
    expect(stringifyToolResult([1, 2, 3])).toBe("[1,2,3]")
  })

  test("primitives stringify to their JSON form", () => {
    expect(stringifyToolResult(5)).toBe("5")
    expect(stringifyToolResult(true)).toBe("true")
    // eslint-disable-next-line unicorn/no-null
    expect(stringifyToolResult(null)).toBe("null")
  })
})
