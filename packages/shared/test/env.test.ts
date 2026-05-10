import { describe, expect, test } from "vitest"
import { isTest } from "../src/env.ts"

describe("env", () => {
  test("isTest", () => {
    expect(isTest).toBe(true)
  })
})
