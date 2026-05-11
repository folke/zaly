import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { coerce } from "../../src/validate/coerce.ts"

describe("coerce — primitive conversion", () => {
  test("coerces string to number", () => {
    const result = coerce(Type.Number(), "42")
    expect(result).toBe(42)
  })

  test("coerces string to boolean", () => {
    expect(coerce(Type.Boolean(), "true")).toBe(true)
    expect(coerce(Type.Boolean(), "false")).toBe(false)
  })

  test("leaves already-valid values untouched", () => {
    expect(coerce(Type.Number(), 42)).toBe(42)
    expect(coerce(Type.String(), "hi")).toBe("hi")
  })
})

describe("coerce — defaults", () => {
  test("fills in missing fields with schema defaults", () => {
    const schema = Type.Object({
      limit: Type.Number({ default: 10 }),
      query: Type.String(),
    })
    const result = coerce(schema, { query: "tokyo" })
    expect(result).toEqual({ limit: 10, query: "tokyo" })
  })

  test("does not override provided values with defaults", () => {
    const schema = Type.Object({
      limit: Type.Number({ default: 10 }),
    })
    const result = coerce(schema, { limit: 5 })
    expect(result).toEqual({ limit: 5 })
  })
})

describe("coerce — unknown property stripping", () => {
  test("removes properties not in the schema", () => {
    const schema = Type.Object({
      name: Type.String(),
    })
    const result = coerce(schema, { extra: "junk", name: "Ada" })
    expect(result).toEqual({ name: "Ada" })
  })
})

describe("coerce — combined", () => {
  test("convert + default + clean in one pass", () => {
    const schema = Type.Object({
      enabled: Type.Boolean(),
      extras: Type.Optional(Type.String()),
      limit: Type.Number({ default: 10 }),
      name: Type.String(),
    })
    const result = coerce(schema, {
      __garbage: "x",
      enabled: "true",
      name: "Ada",
    })
    expect(result).toEqual({ enabled: true, limit: 10, name: "Ada" })
  })
})
