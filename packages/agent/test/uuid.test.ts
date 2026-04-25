import { describe, expect, test } from "vitest"
import { uuidv7 } from "../src/utils/uuid.ts"

const SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("uuidv7", () => {
  test("matches the canonical UUIDv7 string shape", () => {
    for (let i = 0; i < 100; i++) expect(uuidv7()).toMatch(SHAPE)
  })

  test("is monotonically increasing within a tight loop", () => {
    const ids = Array.from({ length: 1000 }, () => uuidv7())
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i] > ids[i - 1]).toBe(true)
    }
  })

  test("is unique across many calls", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uuidv7()))
    expect(ids.size).toBe(10_000)
  })

  test("encodes the timestamp in the leading 48 bits", () => {
    const before = Date.now()
    const id = uuidv7()
    const after = Date.now()
    // Strip dashes, parse the leading 12 hex chars (48 bits) as the
    // millisecond timestamp.
    const ms = parseInt(id.replaceAll("-", "").slice(0, 12), 16)
    expect(ms).toBeGreaterThanOrEqual(before)
    expect(ms).toBeLessThanOrEqual(after)
  })
})
