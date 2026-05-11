import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { stringifyContent } from "../src/content/format.ts"
import { AiError } from "../src/error.ts"
import { defineTool, runTool } from "../src/tools.ts"

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
    expect(typeof Adder.validator.validateParams).toBe("function")
    expect(typeof Adder.call).toBe("function")
  })

  test("validateInput coerces stringified primitives", async () => {
    const input = await Adder.validator.validateParams({ a: "3", b: "4" })
    expect(input).toEqual({ a: 3, b: 4 })
  })

  test("validateInput strips unknown properties", async () => {
    const input = await Adder.validator.validateParams({ a: 1, b: 2, junk: "x" })
    expect(input).toEqual({ a: 1, b: 2 })
  })

  test("validateInput throws with annotated message on bad input", async () => {
    await expect(Adder.validator.validateParams({ a: "notanumber" })).rejects.toThrow(/❌/)
    await expect(Adder.validator.validateParams({ a: "notanumber" })).rejects.toThrow(/b/)
  })
})

describe("defineTool — TypeBox defaults", () => {
  const Search = defineTool({
    name: "search",
    params: Type.Object({
      query: Type.String(),
      limit: Type.Number({ default: 10 }),
      offset: Type.Integer({ default: 0 }),
    }),
    call: (args) => args,
  })

  test("missing optional with default is filled in", async () => {
    const input = await Search.validator.validateParams({ query: "tokyo" })
    expect(input).toEqual({ query: "tokyo", limit: 10, offset: 0 })
  })

  test("explicitly-provided value beats the default", async () => {
    const input = await Search.validator.validateParams({ query: "x", limit: 5 })
    expect(input).toEqual({ query: "x", limit: 5, offset: 0 })
  })

  test("default of 0 is treated as a real value, not 'missing'", async () => {
    // Off-by-one regression guard: `Value.Default` must distinguish
    // "field absent" from "field present with falsy value." We pass
    // `offset: 0` explicitly and expect it to round-trip — not get
    // re-defaulted to anything else.
    const input = await Search.validator.validateParams({ query: "x", offset: 0 })
    expect(input.offset).toBe(0)
  })

  test("default applies after primitive coercion (string '5' → 5)", async () => {
    const input = await Search.validator.validateParams({ query: "x", limit: "5" })
    expect(input).toEqual({ query: "x", limit: 5, offset: 0 })
  })

  test("default flows through runTool to the tool body", async () => {
    const r = await runTool(Search, { query: "hello" }, {})
    const text = (r.content as { text: string }[])[0].text
    expect(JSON.parse(text)).toEqual({ query: "hello", limit: 10, offset: 0 })
  })

  test("default flows through runTool from a JSON-string args input", async () => {
    const r = await runTool(Search, '{"query":"hi"}', {})
    const text = (r.content as { text: string }[])[0].text
    expect(JSON.parse(text)).toEqual({ query: "hi", limit: 10, offset: 0 })
  })

  test("nested object defaults are filled in recursively", async () => {
    const Nested = defineTool({
      name: "nested",
      params: Type.Object({
        opts: Type.Object({
          retries: Type.Number({ default: 3 }),
          timeout: Type.Number({ default: 30 }),
        }),
      }),
      call: (args) => args,
    })
    expect(await Nested.validator.validateParams({ opts: {} })).toEqual({
      opts: { retries: 3, timeout: 30 },
    })
    expect(await Nested.validator.validateParams({ opts: { retries: 1 } })).toEqual({
      opts: { retries: 1, timeout: 30 },
    })
  })

  test("array element defaults are NOT injected for absent elements", async () => {
    // Sanity: defaults apply to declared properties, not array slots.
    // The array stays [] when the model passes [].
    const Tags = defineTool({
      name: "tags",
      params: Type.Object({
        tags: Type.Array(Type.String(), { default: [] }),
      }),
      call: (args) => args,
    })
    expect(await Tags.validator.validateParams({})).toEqual({ tags: [] })
    expect(await Tags.validator.validateParams({ tags: ["a"] })).toEqual({ tags: ["a"] })
  })

  test("default + bad type still errors after coercion can't fix it", async () => {
    await expect(
      Search.validator.validateParams({ query: 123, limit: "not-a-number" })
    ).rejects.toThrow(/❌/)
  })

  test("required field with no default still required even when other fields default", async () => {
    await expect(Search.validator.validateParams({})).rejects.toThrow(/❌/)
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
    expect(stringifyContent(r.content)).toMatch(/❌/)
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
      throw new AiError({
        code: "NOT_FOUND",
        data: { id: "42" },
        message: "record not found",
      })
    },
    params: Type.Object({ id: Type.String() }),
    name: "fail",
  })

  test("surfaces AiError code + message", async () => {
    const r = await runTool(Failing, { id: "42" }, {})
    expect(r.isError).toBe(true)
    const msg = stringifyContent(r.content)
    expect(msg).toContain("NOT_FOUND")
    expect(msg).toContain("record not found")
  })

  test("errors carry a structured ErrorPart in content", async () => {
    const r = await runTool(Failing, { id: "42" }, {})
    expect(Array.isArray(r.content)).toBe(true)
    const parts = r.content as ({ type: string } & Record<string, unknown>)[]
    // Single `ErrorPart` carries everything: `code`, `message`, `data`,
    // `retryable`. The wire boundary folds it to a `<error>` `MetaPart`
    // via `errorToMeta()` later in the pipeline.
    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({
      code: "NOT_FOUND",
      data: { id: "42" },
      message: "record not found",
      type: "error",
    })
  })

  test("structured error sidecar mirrors the ErrorPart fields", async () => {
    const r = await runTool(Failing, { id: "42" }, {})
    expect(r.error).toMatchObject({
      code: "NOT_FOUND",
      data: { id: "42" },
      message: "record not found",
    })
  })

  test("non-AiError throws are wrapped as ERROR", async () => {
    const Throws = defineTool({
      call: () => {
        throw new Error("oops")
      },
      params: Type.Object({}),
      name: "throws",
    })
    const r = await runTool(Throws, {}, {})
    expect(r.error?.code).toBe("ERROR")
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
    expect(stringifyContent(r.content)).toContain("boom")
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

describe("stringifyContent", () => {
  test("strings pass through verbatim", () => {
    expect(stringifyContent("hello")).toBe("hello")
    expect(stringifyContent("")).toBe("")
  })

  test("array of text parts joins with newlines", () => {
    expect(
      stringifyContent([
        { text: "line one", type: "text" },
        { text: "line two", type: "text" },
      ])
    ).toBe("line one\nline two")
  })

  test("non-text parts flatten to <kind> meta tags carrying mime/source ref", () => {
    expect(
      stringifyContent([
        { text: "look at this", type: "text" },
        {
          mime: "image/png",
          source: { data: "iVBORw0K", type: "base64" },
          type: "image",
        },
      ])
    ).toBe('look at this\n<image>{"mime":"image/png"}</image>')
  })
})
