import { describe, expect, test } from "vitest"
import { clamp, resolveSize } from "../../src/layout/size.ts"

describe("resolveSize", () => {
  test("number passes through", () => {
    expect(resolveSize(10, 100)).toBe(10)
  })

  test("percent of available", () => {
    expect(resolveSize("50%", 100)).toBe(50)
    expect(resolveSize("25%", 80)).toBe(20)
  })

  test("percent rounds down", () => {
    // 33% of 10 = 3.3 — default to floor so content never exceeds allocation.
    expect(resolveSize("33%", 10)).toBe(3)
  })

  test("'fill' returns full available", () => {
    expect(resolveSize("fill", 42)).toBe(42)
  })

  test("'fit' returns undefined (caller measures)", () => {
    expect(resolveSize("fit", 100)).toBeUndefined()
  })

  test("undefined input returns undefined", () => {
    expect(resolveSize(undefined, 100)).toBeUndefined()
  })
})

describe("clamp", () => {
  test("no bounds: value passes through", () => {
    expect(clamp(50, { available: 100 })).toBe(50)
  })

  test("min as number", () => {
    expect(clamp(5, { available: 100, min: 10 })).toBe(10)
    expect(clamp(15, { available: 100, min: 10 })).toBe(15)
  })

  test("max as number", () => {
    expect(clamp(50, { available: 100, max: 30 })).toBe(30)
    expect(clamp(20, { available: 100, max: 30 })).toBe(20)
  })

  test("min as percent", () => {
    expect(clamp(5, { available: 100, min: "20%" })).toBe(20)
  })

  test("max as percent", () => {
    expect(clamp(90, { available: 100, max: "50%" })).toBe(50)
  })

  test("min takes precedence over max when overlapping", () => {
    // With min=50, max=30 on a value of 10: clamping to min then max gives 30,
    // which violates min. Standard flex behavior says min wins.
    expect(clamp(10, { available: 100, max: 30, min: 50 })).toBe(50)
  })
})
