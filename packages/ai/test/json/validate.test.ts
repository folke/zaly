import { Type } from "typebox"
import { describe, expect, test } from "vitest"
import { validate } from "../../src/json/validate.ts"

const Person = Type.Object({
  age: Type.Number(),
  name: Type.String(),
})

describe("validate — happy path", () => {
  test("returns success for valid value", () => {
    const result = validate(Person, { age: 30, name: "Ada" })
    expect(result).toEqual({ data: { age: 30, name: "Ada" }, success: true })
  })

  test("narrows data to schema static type", () => {
    const result = validate(Person, { age: 30, name: "Ada" })
    if (!result.success) throw new Error("expected success")
    const name: string = result.data.name
    const age: number = result.data.age
    expect(`${name}:${age}`).toBe("Ada:30")
  })
})

describe("validate — failure path", () => {
  test("returns errors for missing required field", () => {
    const result = validate(Person, { name: "Ada" })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].keyword).toBe("required")
  })

  test("returns errors for wrong type", () => {
    const result = validate(Person, { age: "thirty", name: "Ada" })
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected failure")
    const types = result.errors.map((e) => e.keyword)
    expect(types).toContain("type")
  })

  test("every error carries an instancePath and message", () => {
    const result = validate(Person, { age: "thirty" })
    if (result.success) throw new Error("expected failure")
    for (const err of result.errors) {
      expect(typeof err.instancePath).toBe("string")
      expect(typeof err.message).toBe("string")
      expect(err.message.length).toBeGreaterThan(0)
    }
  })
})

describe("validate — primitives", () => {
  test("accepts a bare string schema", () => {
    const result = validate(Type.String(), "hello")
    expect(result).toEqual({ data: "hello", success: true })
  })

  test("rejects a bare number against a string schema", () => {
    const result = validate(Type.String(), 42)
    expect(result.success).toBe(false)
  })
})
