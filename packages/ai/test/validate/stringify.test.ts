import type { TSchema } from "typebox"

import { Type } from "typebox"
import { Value } from "typebox/value"
import { describe, expect, test } from "vitest"
import { stringifyErrors } from "../../src/validate/stringify.ts"

function annotate(schema: TSchema, value: unknown) {
  const errors = Value.Errors(schema, value)
  if (errors.length === 0) throw new Error("expected validation failure")
  return stringifyErrors(schema, value, errors)
}

describe("stringifyErrors — basic errors", () => {
  test("annotates a wrong type on a leaf field", () => {
    const schema = Type.Object({ age: Type.Number(), name: Type.String() })
    const out = annotate(schema, { age: "thirty", name: "Ada" })
    expect(out).toContain('"age": "thirty"')
    expect(out).toMatch(/"age": "thirty".*❌/)
  })

  test("annotates missing required fields with type-shaped message", () => {
    const schema = Type.Object({ age: Type.Number(), name: Type.String() })
    const out = annotate(schema, { name: "Ada" })
    expect(out).toMatch(/"age": undefined.*❌ must be number \(missing\)/)
  })

  test("handles root-level type error", () => {
    const out = annotate(Type.Object({ x: Type.Number() }), "not an object")
    expect(out).toContain("❌")
    expect(out).toContain("not an object")
  })
})

describe("stringifyErrors — nested errors", () => {
  test("annotates error in a nested object", () => {
    const schema = Type.Object({
      user: Type.Object({ name: Type.String() }),
    })
    const out = annotate(schema, { user: { name: 42 } })
    expect(out).toMatch(/"name": 42.*❌/)
  })

  test("annotates error in an array item", () => {
    const schema = Type.Object({
      nums: Type.Array(Type.Number()),
    })
    const out = annotate(schema, { nums: [1, "two", 3] })
    expect(out).toMatch(/"two".*❌/)
  })
})

describe("stringifyErrors — additional properties", () => {
  test("annotates extra properties when schema is strict", () => {
    const schema = Type.Object({ name: Type.String() }, { additionalProperties: false })
    const out = annotate(schema, { extra: 1, name: "Ada" })
    expect(out).toMatch(/"extra".*❌/)
  })
})

describe("stringifyErrors — optional/default schemas", () => {
  test("does not report missing optional fields with defaults", () => {
    const schema = Type.Object({
      limit: Type.Optional(Type.Integer({ default: 10 })),
      query: Type.String(),
    })
    const errors = Value.Errors(schema, { query: "zaly" })
    expect(errors).toEqual([])
  })

  test("summarizes literal unions as allowed values", () => {
    const schema = Type.Object({
      type: Type.Optional(
        Type.Union([Type.Literal("file"), Type.Literal("dir"), Type.Literal("any")], {
          default: "file",
        })
      ),
    })
    const out = annotate(schema, { type: "all" })
    expect(out).toContain('"type": "all"')
    expect(out).toContain('must be one of: "file", "dir", "any"')
    expect(out).not.toContain("must match a schema in anyOf")
  })

  test("summarizes enums as allowed values", () => {
    const schema = Type.Object({ mode: Type.Enum({ Auto: "auto", Manual: "manual" }) })
    const out = annotate(schema, { mode: "invalid" })
    expect(out).toContain('"mode": "invalid"')
    expect(out).toContain('must be one of: "auto", "manual"')
  })

  test("summarizes invalid discriminators without branch noise", () => {
    const schema = Type.Object({
      value: Type.Union([
        Type.Object({ kind: Type.Literal("a"), text: Type.String() }),
        Type.Object({ count: Type.Number(), kind: Type.Literal("b") }),
      ]),
    })
    const out = annotate(schema, { value: { kind: "c" } })
    expect(out).toContain('"kind": "c"')
    expect(out).toContain('must be one of: "a", "b"')
    expect(out).not.toContain('"text": undefined')
    expect(out).not.toContain('"count": undefined')
    expect(out).not.toContain("must match a schema in anyOf")
  })
})

describe("stringifyErrors — unmappable errors", () => {
  test("appends an unmappable-errors block for errors not placed in the tree", () => {
    const schema = Type.Object({ x: Type.Number() })
    const value = { x: 1 }
    const syntheticError = {
      instancePath: "/nowhere/deep",
      keyword: "type" as const,
      message: "must be string",
      params: { type: "string" },
      schemaPath: "#/nowhere",
    }
    const out = stringifyErrors(schema, value, [syntheticError])
    expect(out).toContain("Unmappable")
    expect(out).toContain("/nowhere/deep")
    expect(out).toContain("must be string")
  })
})

describe("stringifyErrors — formatting", () => {
  test("output is valid-looking JSON5 with 2-space indent", () => {
    const schema = Type.Object({ name: Type.String() })
    const out = annotate(schema, { name: 42 })
    expect(out.startsWith("{")).toBe(true)
    expect(out).toContain("  ")
  })

  test("clean fields have no annotations", () => {
    const schema = Type.Object({ age: Type.Number(), name: Type.String() })
    const out = annotate(schema, { age: "thirty", name: "Ada" })
    const nameLine = out.split("\n").find((l) => l.includes('"name"'))
    expect(nameLine).toBeDefined()
    expect(nameLine).not.toContain("❌")
  })
})
