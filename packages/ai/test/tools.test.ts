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
  test("number return wraps as JSON-formatted text part", async () => {
    const r = await runTool(Adder, { a: 2, b: 3 }, {})
    expect(r).toEqual({
      content: [{ format: "json", text: "5", type: "text" }],
      isError: false,
    })
  })

  test("accepts a JSON string for args", async () => {
    const r = await runTool(Adder, '{"a": 2, "b": 3}', {})
    expect((r.content as { text: string }[])[0].text).toBe("5")
  })

  test("applies coercion through runTool", async () => {
    const r = await runTool(Adder, { a: "10", b: "20" }, {})
    expect((r.content as { text: string }[])[0].text).toBe("30")
  })
})

describe("runTool — object return wraps as JSON-formatted text part", () => {
  const Json = defineTool({
    call: () => ({ conditions: "sunny", temp: 72 }),
    params: Type.Object({}),
    name: "weather",
  })

  test("object → array with TextPart + format: 'json'", async () => {
    const r = await runTool(Json, {}, {})
    expect(r.isError).toBe(false)
    expect(r.content).toEqual([
      { format: "json", text: '{"conditions":"sunny","temp":72}', type: "text" },
    ])
  })
})

describe("runTool — validation failures", () => {
  test("returns annotated error on invalid args", async () => {
    const r = await runTool(Adder, { a: "notanumber" }, {})
    expect(r.isError).toBe(true)
    expect(stringifyToolResult(r.content)).toMatch(/❌/)
  })

  test("populates structured error.code + error.message", async () => {
    const r = await runTool(Adder, { a: "notanumber" }, {})
    expect(r.error?.code).toBe("INVALID_INPUT")
    expect(r.error?.message).toBeTruthy()
  })

  test("returns parse error on unsalvageable JSON string", async () => {
    const r = await runTool(Adder, "", {})
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
    const r = await runTool(Failing, { id: "42" }, {})
    expect(r.isError).toBe(true)
    const msg = stringifyToolResult(r.content)
    expect(msg).toContain("NOT_FOUND")
    expect(msg).toContain("record not found")
  })

  test("errors land as a string content (no parts)", async () => {
    const r = await runTool(Failing, { id: "42" }, {})
    expect(typeof r.content).toBe("string")
  })

  test("structured error preserves code, data, retryable from ToolError", async () => {
    const r = await runTool(Failing, { id: "42" }, {})
    expect(r.error).toEqual({
      code: "NOT_FOUND",
      data: { id: "42" },
      message: "record not found",
      retryable: false,
    })
  })

  test("non-ToolError throws are wrapped as INTERNAL", async () => {
    const Throws = defineTool({
      call: () => {
        throw new Error("oops")
      },
      params: Type.Object({}),
      name: "throws",
    })
    const r = await runTool(Throws, {}, {})
    expect(r.error?.code).toBe("INTERNAL")
    expect(r.error?.message).toBe("oops")
  })

  test("wraps unknown throws as internal errors", async () => {
    const Throws = defineTool({
      call: () => {
        throw new Error("boom")
      },
      params: Type.Object({}),
      name: "throws",
    })
    const r = await runTool(Throws, {}, {})
    expect(r.isError).toBe(true)
    expect(stringifyToolResult(r.content)).toContain("boom")
  })
})

describe("runTool — output validation", () => {
  const Echo = defineTool({
    call: (_x: { n: number }) => ({ wrong: "shape" }) as unknown as { n: number },
    params: Type.Object({ n: Type.Number() }),
    name: "echo",
    result: Type.Object({ n: Type.Number() }),
  })

  test("throws when output violates the schema (implementation bug, not LLM error)", async () => {
    await expect(runTool(Echo, { n: 1 }, {})).rejects.toThrow()
  })
})

describe("stringifyToolResult", () => {
  test("strings pass through verbatim", () => {
    expect(stringifyToolResult("hello")).toBe("hello")
    expect(stringifyToolResult("")).toBe("")
  })

  test("array of text parts joins with newlines", () => {
    expect(
      stringifyToolResult([
        { text: "line one", type: "text" },
        { text: "line two", type: "text" },
      ])
    ).toBe("line one\nline two")
  })

  test("non-text parts become bracketed placeholders", () => {
    expect(
      stringifyToolResult([
        { text: "look at this", type: "text" },
        {
          mime: "image/png",
          source: { data: "iVBORw0K", type: "base64" },
          type: "image",
        },
      ])
    ).toBe("look at this\n[image]")
  })
})
