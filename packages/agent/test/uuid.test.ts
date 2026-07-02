import { describe, expect, test } from "vitest"
import { isUuidv7, isUuidv7Like, uuidv7 } from "../src/utils/uuid.ts"

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

  test("isUuidv7 validates canonical UUIDv7 shape", () => {
    const id = uuidv7()
    expect(isUuidv7(id)).toBe(true)
    expect(isUuidv7(id.toUpperCase())).toBe(true)
    expect(isUuidv7(id.replace("-7", "-6"))).toBe(false)
    expect(isUuidv7("not-a-uuid")).toBe(false)
  })

  test("isUuidv7Like accepts current v7 prefixes and rejects short/invalid/old/future prefixes", () => {
    const id = uuidv7()
    expect(isUuidv7Like(id.slice(0, 8))).toBe(true)
    expect(isUuidv7Like("123456")).toBe(false)
    expect(isUuidv7Like("zzzzzzz")).toBe(false)
    expect(isUuidv7Like("00000000-0000-7000-8000-000000000000")).toBe(false)

    const future = (Date.now() + 2 * 3600 * 1000).toString(16).padStart(12, "0")
    expect(isUuidv7Like(`${future.slice(0, 8)}-${future.slice(8)}`)).toBe(false)
  })
})
