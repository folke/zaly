import type { TSchema } from "typebox"

import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { stringifyErrors } from "../../src/json/stringify.ts"
import { validate } from "../../src/json/validate.ts"

function annotate(schema: TSchema, value: unknown) {
  const result = validate(schema, value)
  if (result.success) throw new Error("expected validation failure")
  return stringifyErrors(schema, value, result.errors)
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
